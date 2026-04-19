"""
Pipeline output cache — persist processed data to parquet so the dashboard
never has to re-run the pipeline on startup.

Layout on disk (all relative to CACHE_DIR, default: project_root/data/processed/):
  awards.parquet       — resolved, cleaned award records
  programs.parquet     — scraped program metadata
  qa_report.json       — QA check results
  meta.json            — run metadata (timestamp, record counts, pipeline version)

Usage:
  # After running the pipeline:
  from pipeline.cache import save, load, is_fresh
  save(awards_df, programs_df, qa_report)

  # On dashboard startup:
  if is_fresh():
      awards_df, programs_df, qa_report = load()
  else:
      raise RuntimeError("Cache missing — run: python -m pipeline run")
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .constants import PIPELINE_VERSION

log = logging.getLogger(__name__)

# ── Cache location ─────────────────────────────────────────────────────────────
# Override with env var GRANT_RADAR_CACHE_DIR for deployment flexibility.
# cache.py lives at: grant_radar/backend/pipeline/cache.py
# parents[0] = pipeline/, parents[1] = backend/, parents[2] = grant_radar/
_DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "processed"

def _cache_dir() -> Path:
    d = Path(os.getenv("GRANT_RADAR_CACHE_DIR", _DEFAULT_CACHE_DIR))
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Public API ────────────────────────────────────────────────────────────────

def save(
    awards_df: pd.DataFrame,
    programs_df: pd.DataFrame,
    qa_report: list[dict],
) -> Path:
    """
    Persist pipeline output to parquet + JSON.
    Returns the cache directory path.
    """
    cache = _cache_dir()

    log.info("Saving pipeline cache → %s", cache)

    # Awards — parquet preserves dtypes, ~5–10× smaller than CSV
    awards_path = cache / "awards.parquet"
    awards_df.to_parquet(awards_path, index=False, engine="pyarrow")
    log.info("  awards.parquet: %d rows, %.1f MB", len(awards_df), awards_path.stat().st_size / 1e6)

    # Programs — may be empty
    prog_path = cache / "programs.parquet"
    if programs_df is not None and not programs_df.empty:
        # Lists in cells need special handling: store as JSON strings
        prog_serialisable = programs_df.copy()
        for col in ("naics_codes", "naics_keywords", "province_scope"):
            if col in prog_serialisable.columns:
                prog_serialisable[col] = prog_serialisable[col].apply(
                    lambda v: json.dumps(v) if isinstance(v, list) else v
                )
        prog_serialisable.to_parquet(prog_path, index=False, engine="pyarrow")
        log.info("  programs.parquet: %d rows", len(programs_df))
    else:
        # Write an empty marker so load() doesn't fail
        pd.DataFrame().to_parquet(prog_path, index=False, engine="pyarrow")

    # QA report
    qa_path = cache / "qa_report.json"
    qa_path.write_text(json.dumps(qa_report, indent=2))

    # Metadata
    meta = {
        "pipeline_version": PIPELINE_VERSION,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "awards_count": len(awards_df),
        "programs_count": len(programs_df) if programs_df is not None else 0,
        "qa_checks": len(qa_report),
    }
    (cache / "meta.json").write_text(json.dumps(meta, indent=2))
    log.info("  meta.json written — pipeline_version=%s", PIPELINE_VERSION)

    return cache


def load() -> tuple[pd.DataFrame, pd.DataFrame, list[dict]]:
    """
    Load cached pipeline output.
    Raises FileNotFoundError if cache is missing.
    """
    cache = _cache_dir()
    awards_path = cache / "awards.parquet"
    prog_path   = cache / "programs.parquet"
    qa_path     = cache / "qa_report.json"

    if not awards_path.exists():
        raise FileNotFoundError(
            f"Cache not found at {awards_path}. "
            "Run the pipeline first:  python -m pipeline run"
        )

    log.info("Loading pipeline cache from %s", cache)

    awards_df = pd.read_parquet(awards_path, engine="pyarrow")
    log.info("  awards: %d rows loaded", len(awards_df))

    if prog_path.exists():
        programs_df = pd.read_parquet(prog_path, engine="pyarrow")
        # Deserialise list columns stored as JSON strings
        for col in ("naics_codes", "naics_keywords", "province_scope"):
            if col in programs_df.columns:
                programs_df[col] = programs_df[col].apply(
                    lambda v: json.loads(v) if isinstance(v, str) else (v if isinstance(v, list) else [])
                )
        log.info("  programs: %d rows loaded", len(programs_df))
    else:
        programs_df = pd.DataFrame()

    qa_report = json.loads(qa_path.read_text()) if qa_path.exists() else []

    return awards_df, programs_df, qa_report


def is_fresh(max_age_hours: float = 48) -> bool:
    """
    Return True if a valid, recent cache exists.
    max_age_hours: treat cache as stale if older than this (default 48 h).
    """
    meta_path = _cache_dir() / "meta.json"
    awards_path = _cache_dir() / "awards.parquet"

    if not meta_path.exists() or not awards_path.exists():
        return False

    try:
        meta = json.loads(meta_path.read_text())
        saved_at = datetime.fromisoformat(meta["saved_at"])
        age_hours = (datetime.now(timezone.utc) - saved_at).total_seconds() / 3600
        if age_hours > max_age_hours:
            log.warning("Cache is %.1f hours old (max %.1f h) — consider re-running the pipeline", age_hours, max_age_hours)
            # Still return True — stale cache is better than no data on dashboard startup
        return True
    except Exception as exc:
        log.warning("Cache meta read failed: %s", exc)
        return False


def cache_info() -> dict:
    """Return a summary of the current cache state (for /api/health)."""
    meta_path = _cache_dir() / "meta.json"
    if not meta_path.exists():
        return {"status": "missing", "path": str(_cache_dir())}
    try:
        meta = json.loads(meta_path.read_text())
        saved_at = datetime.fromisoformat(meta["saved_at"])
        age_hours = (datetime.now(timezone.utc) - saved_at).total_seconds() / 3600
        return {
            "status": "ok",
            "path": str(_cache_dir()),
            "saved_at": meta["saved_at"],
            "age_hours": round(age_hours, 1),
            "awards_count": meta.get("awards_count", 0),
            "programs_count": meta.get("programs_count", 0),
            "pipeline_version": meta.get("pipeline_version"),
        }
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
