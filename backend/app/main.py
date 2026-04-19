"""
Grant Radar FastAPI application.

IMPORTANT: The pipeline is NOT run here. The dashboard is read-only.

Before starting the server, run the pipeline once to build the cache:
    cd backend
    python -m pipeline run              # 10 K records (fast, good for dev)
    python -m pipeline run --limit 0    # full dataset (production)

The server loads from data/processed/*.parquet on startup in <1 second.
To refresh data, re-run the pipeline script and restart the server.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from pipeline.cache import load as load_cache, cache_info, is_fresh
from pipeline.intelligence import (
    competitor_map,
    funding_trend,
    program_intelligence,
    sector_heatmap,
    overview_stats,
    top_recipients,
)
from pipeline.constants import NAICS_SECTORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger(__name__)

# ── App state ─────────────────────────────────────────────────────────────────

_state: dict[str, Any] = {
    "df": None,
    "programs_df": None,
    "qa": [],
    "ready": False,
    "error": None,
    "cache_info": {},
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load pre-computed pipeline output from parquet cache on startup."""
    log.info("Loading pipeline cache…")
    try:
        awards_df, programs_df, qa_report = load_cache()
        _state["df"] = awards_df
        _state["programs_df"] = programs_df
        _state["qa"] = qa_report
        _state["ready"] = True
        _state["cache_info"] = cache_info()
        log.info(
            "Ready — %d award records, %d program records",
            len(awards_df),
            len(programs_df) if programs_df is not None else 0,
        )
        if not is_fresh():
            log.warning(
                "Cache may be stale. Re-run: python -m pipeline run"
            )
    except FileNotFoundError as exc:
        _state["error"] = (
            "Pipeline cache not found. "
            "Run:  cd backend && python -m pipeline run"
        )
        log.error("%s", exc)
    except Exception as exc:
        _state["error"] = str(exc)
        log.error("Failed to load cache: %s", exc)
    yield
    log.info("Shutting down.")


app = FastAPI(
    title="Grant Radar API",
    version="0.4.0",
    description="Canadian government grants competitive intelligence",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _require_data() -> pd.DataFrame:
    if not _state["ready"]:
        msg = _state.get("error") or "Pipeline cache not loaded."
        raise HTTPException(status_code=503, detail=msg)
    return _state["df"]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ready" if _state["ready"] else "unavailable",
        "records": len(_state["df"]) if _state["df"] is not None else 0,
        "program_records": len(_state["programs_df"]) if _state["programs_df"] is not None else 0,
        "error": _state.get("error"),
        "cache": _state.get("cache_info", {}),
    }


@app.get("/api/stats")
def stats():
    df = _require_data()
    return overview_stats(df)


@app.get("/api/naics-sectors")
def naics_sectors():
    """Return NAICS 2-digit sectors that have data in the loaded dataset."""
    df = _require_data()
    codes_with_data = df["naics_code"].dropna().str[:2].unique().tolist()
    return [
        {"code": code, "label": NAICS_SECTORS.get(code, "Other")}
        for code in sorted(set(codes_with_data))
        if code in NAICS_SECTORS
    ]


@app.get("/api/competitor-map")
def get_competitor_map(
    naics: str = Query(..., description="NAICS prefix (2–6 digits)"),
    province: str | None = Query(None, description="2-letter province code, e.g. 'ON'"),
    top_n: int = Query(20, ge=1, le=100),
    min_award: float = Query(25_000, ge=0),
):
    df = _require_data()
    return competitor_map(df, naics_prefix=naics, province=province, top_n=top_n, min_award=min_award)


@app.get("/api/funding-trend")
def get_funding_trend(
    naics: str = Query(..., description="NAICS prefix"),
    province: str | None = Query(None),
):
    df = _require_data()
    return funding_trend(df, naics_prefix=naics, province=province)


@app.get("/api/program-intelligence")
def get_program_intelligence(
    naics: str = Query(..., description="NAICS prefix"),
    top_n: int = Query(10, ge=1, le=50),
):
    df = _require_data()
    return program_intelligence(df, naics_prefix=naics, top_n=top_n)


@app.get("/api/top-recipients")
def get_top_recipients(
    province: str | None = Query(None, description="2-letter province code"),
    top_n: int = Query(20, ge=1, le=100),
    min_award: float = Query(0, ge=0),
):
    """Top grant recipients by total funding — no NAICS filter required."""
    df = _require_data()
    return top_recipients(df, top_n=top_n, province=province, min_award=min_award)


@app.get("/api/programs")
def get_programs(
    status: str | None = Query(None, description="'open' or 'closed'"),
    program_type: str | None = Query(None, description="'grant', 'loan', 'repayable', 'tax_credit'"),
):
    """
    Scraped program metadata — eligibility, funding range, NAICS codes, status.
    Comes from the unstructured HTML pipeline (programs_scraper).
    """
    if not _state["ready"]:
        raise HTTPException(status_code=503, detail=_state.get("error") or "Cache not loaded.")

    programs_df = _state.get("programs_df")
    if programs_df is None or programs_df.empty:
        return []

    df = programs_df.copy()
    if status:
        df = df[df["status"] == status.lower()]
    if program_type:
        df = df[df["program_type"] == program_type.lower()]

    def _s(v):
        try: return None if pd.isna(v) else str(v)
        except Exception: return str(v) if v is not None else None

    def _f(v):
        try: return None if pd.isna(v) else float(v)
        except Exception: return None

    records = []
    for _, row in df.iterrows():
        records.append({
            "program_id":       _s(row.get("program_id")),
            "program_name":     _s(row.get("program_name")),
            "description":      _s(row.get("description")),
            "eligibility_text": _s(row.get("eligibility_text")),
            "program_type":     _s(row.get("program_type")),
            "min_funding":      _f(row.get("min_funding")),
            "max_funding":      _f(row.get("max_funding")),
            "naics_codes":      list(row.get("naics_codes") or []),
            "naics_keywords":   list(row.get("naics_keywords") or [])[:6],
            "province_scope":   list(row.get("province_scope") or []),
            "status":           _s(row.get("status")),
            "source_url":       _s(row.get("source_url")),
        })
    return records


@app.get("/api/recipient/{entity_id}")
def get_recipient(entity_id: str):
    df = _require_data()
    rows = df[df["entity_id"] == entity_id]
    if rows.empty:
        raise HTTPException(status_code=404, detail="Recipient not found")

    r = rows.iloc[0]

    def _s(v):
        try: return None if pd.isna(v) else str(v)
        except Exception: return str(v) if v is not None else None

    def _f(v):
        try: return None if pd.isna(v) else float(v)
        except Exception: return None

    total_funding = float(rows["award_value"].fillna(0).sum())
    by_year = (
        rows[rows["award_value"].notna() & rows["fiscal_year"].notna()]
        .groupby("fiscal_year")["award_value"].sum()
        .sort_index()
        .to_dict()
    )
    programs = rows["program_name"].dropna().value_counts().head(10).to_dict()
    departments = rows["department"].dropna().value_counts().head(5).to_dict()

    awards = []
    for _, row in rows.sort_values("fiscal_year", ascending=False).head(50).iterrows():
        v = _f(row.get("award_value"))
        awards.append({
            "source_ref":    _s(row.get("source_ref")),
            "fiscal_year":   _s(row.get("fiscal_year")),
            "program_name":  _s(row.get("program_name")),
            "department":    _s(row.get("department")),
            "award_value":   v,
            "award_fmt":     f"${v/1e6:.1f}M" if v and v >= 1e6 else (f"${v/1e3:.0f}K" if v and v >= 1e3 else (f"${v:.0f}" if v else "—")),
            "start_date":    _s(row.get("start_date")),
            "end_date":      _s(row.get("end_date")),
            "naics_code":    _s(row.get("naics_code")),
            "description":   _s(row.get("description")),
        })

    return {
        "entity_id":      entity_id,
        "recipient_name": _s(r.get("recipient_name")),
        "recipient_bn":   _s(r.get("recipient_bn")),
        "province":       _s(r.get("recipient_province")),
        "city":           _s(r.get("recipient_city")),
        "total_funding":  total_funding,
        "total_funding_fmt": f"${total_funding/1e6:.1f}M" if total_funding >= 1e6 else f"${total_funding/1e3:.0f}K",
        "grant_count":    len(rows),
        "first_year":     _s(rows["fiscal_year"].dropna().min()),
        "latest_year":    _s(rows["fiscal_year"].dropna().max()),
        "by_year":        by_year,
        "top_programs":   programs,
        "top_departments":departments,
        "awards":         awards,
    }


@app.get("/api/sector-heatmap")
def get_sector_heatmap():
    df = _require_data()
    return sector_heatmap(df)


@app.get("/api/qa-report")
def get_qa_report():
    _require_data()
    return _state["qa"]
