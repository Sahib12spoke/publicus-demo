"""The four intelligence query functions that power the dashboard."""

import re

import pandas as pd
from .constants import NAICS_SECTORS


def competitor_map(
    df: pd.DataFrame,
    naics_prefix: str,
    province: str | None = None,
    top_n: int = 20,
    min_award: float = 25_000,
) -> list[dict]:
    mask = (
        df["naics_code"].fillna("").str.startswith(naics_prefix)
        & (df["award_value"].fillna(0) >= min_award)
    )
    if province:
        mask &= df["recipient_province"] == province.upper()

    filtered = df[mask]
    if filtered.empty:
        return []

    result = (
        filtered.groupby(["entity_id", "recipient_name", "recipient_province"])
        .agg(
            total_funding=("award_value", "sum"),
            grant_count=("source_ref", "count"),
            latest_year=("fiscal_year", "max"),
            programs=("program_name", lambda x: list(x.dropna().unique())[:3]),
        )
        .reset_index()
        .sort_values("total_funding", ascending=False)
        .head(top_n)
    )

    rows = []
    for rank, (_, row) in enumerate(result.iterrows(), 1):
        v = row["total_funding"]
        rows.append({
            "rank": rank,
            "entity_id": row["entity_id"],
            "recipient_name": row["recipient_name"],
            "province": row["recipient_province"],
            "total_funding": float(v),
            "total_funding_fmt": f"${v/1e6:.1f}M" if v >= 1e6 else f"${v/1e3:.0f}K",
            "grant_count": int(row["grant_count"]),
            "latest_year": row["latest_year"],
            "programs": row["programs"],
        })
    return rows


def funding_trend(
    df: pd.DataFrame,
    naics_prefix: str,
    province: str | None = None,
) -> list[dict]:
    mask = df["naics_code"].fillna("").str.startswith(naics_prefix)
    if province:
        mask &= df["recipient_province"] == province.upper()

    filtered = df[mask & df["award_value"].notna() & df["fiscal_year"].notna()]
    if filtered.empty:
        return []

    trend = (
        filtered.groupby("fiscal_year")
        .agg(
            total_funding=("award_value", "sum"),
            award_count=("source_ref", "count"),
            unique_recipients=("entity_id", "nunique"),
        )
        .reset_index()
        .sort_values("fiscal_year")
    )
    return trend.rename(columns={"fiscal_year": "year"}).to_dict(orient="records")


def program_intelligence(
    df: pd.DataFrame,
    naics_prefix: str,
    top_n: int = 10,
) -> list[dict]:
    mask = (
        df["naics_code"].fillna("").str.startswith(naics_prefix)
        & df["program_name"].notna()
        & df["award_value"].notna()
    )
    filtered = df[mask]
    if filtered.empty:
        return []

    result = (
        filtered.groupby("program_name")
        .agg(
            total_awarded=("award_value", "sum"),
            award_count=("source_ref", "count"),
            median_award=("award_value", "median"),
            unique_recipients=("entity_id", "nunique"),
        )
        .reset_index()
        .sort_values("total_awarded", ascending=False)
        .head(top_n)
    )

    rows = []
    for _, row in result.iterrows():
        t = row["total_awarded"]
        m = row["median_award"]
        rows.append({
            "program_name": row["program_name"],
            "total_awarded": float(t),
            "total_fmt": f"${t/1e6:.1f}M" if t >= 1e6 else f"${t/1e3:.0f}K",
            "award_count": int(row["award_count"]),
            "median_award": float(m),
            "median_fmt": f"${m/1e3:.0f}K",
            "unique_recipients": int(row["unique_recipients"]),
        })
    return rows


def sector_heatmap(df: pd.DataFrame) -> dict:
    d = df[
        df["naics_code"].notna()
        & df["recipient_province"].notna()
        & df["award_value"].notna()
    ].copy()
    d["sector_code"] = d["naics_code"].str[:2]
    d["sector"] = d["sector_code"].map(NAICS_SECTORS).fillna("Other")

    pivot = (
        d.pivot_table(
            values="award_value",
            index="sector",
            columns="recipient_province",
            aggfunc="sum",
            fill_value=0,
        )
        / 1e6
    ).round(1)

    return {
        "sectors": pivot.index.tolist(),
        "provinces": pivot.columns.tolist(),
        "values": pivot.values.tolist(),
    }


def top_recipients(
    df: pd.DataFrame,
    top_n: int = 20,
    province: str | None = None,
    min_award: float = 0,
) -> list[dict]:
    """
    Top recipients by total funding — no NAICS filter required.
    Useful when NAICS coverage is sparse (e.g. early data loads).
    """
    mask = df["award_value"].fillna(0) >= min_award
    if province:
        mask &= df["recipient_province"] == province.upper()

    filtered = df[mask]
    if filtered.empty:
        return []

    result = (
        filtered.groupby(["entity_id", "recipient_name", "recipient_province"])
        .agg(
            total_funding=("award_value", "sum"),
            grant_count=("source_ref", "count"),
            latest_year=("fiscal_year", "max"),
            programs=("program_name", lambda x: list(x.dropna().unique())[:3]),
        )
        .reset_index()
        .sort_values("total_funding", ascending=False)
        .head(top_n)
    )

    rows = []
    for rank, (_, row) in enumerate(result.iterrows(), 1):
        v = row["total_funding"]
        rows.append({
            "rank": rank,
            "entity_id": row["entity_id"],
            "recipient_name": row["recipient_name"],
            "province": row["recipient_province"],
            "total_funding": float(v),
            "total_funding_fmt": f"${v/1e6:.1f}M" if v >= 1e6 else f"${v/1e3:.0f}K",
            "grant_count": int(row["grant_count"]),
            "latest_year": row["latest_year"],
            "programs": row["programs"],
        })
    return rows


_NONCORP_PAT = re.compile(
    r"\b(university|universit[ée]|college|coll[èe]ge|polytechnic|polytechnique|"
    r"school|[ée]cole|research\s+centre|research\s+center|centre\s+de\s+recherche|"
    r"innovation\s+centre|innovation\s+center|centre\s+d['e]innovation|"
    r"foundation|fondation|federation|f[ée]d[ée]ration|association|council|conseil|"
    r"chamber\s+of\s+commerce|ministry|minist[èe]re|government\s+of|gouvernement\s+du?|"
    r"agency|agence|crown\s+corp|nonprofit|non[-\s]profit|charity|charitable)\b",
    re.IGNORECASE,
)

_CORP_SUFFIX_PAT = re.compile(
    r"\b(inc|ltd|ltee|ltée|limited|llc|llp|corp|corporation|company|"
    r"co|gmbh|sarl|srl|pty|plc)\.?\b",
    re.IGNORECASE,
)

# "Lastname, Firstname [Middle/initial]" — letters/space/hyphen/apostrophe/period only
_INDIVIDUAL_PAT = re.compile(r"^[A-Za-zÀ-ÿ\s\-']+,\s+[A-Za-zÀ-ÿ\s\-'.]+$")


def _is_corporate(name: str | None) -> bool:
    if not name:
        return False
    s = str(name).strip()
    # "|" means fuzzy-matched cluster — trust it if no noncorp hit
    if _NONCORP_PAT.search(s):   # noncorp keywords win even if "Inc" is present
        return False
    if _INDIVIDUAL_PAT.match(s):
        return False
    if "|" in s:
        return True
    if _CORP_SUFFIX_PAT.search(s):
        return True
    # Unknown form — keep it (better to show a false positive than hide a real competitor)
    return True


def _fill_fy_range(years_present: list[str]) -> list[str]:
    """Return continuous FY strings ('YYYY-YYYY') covering min→max of input."""
    starts = []
    for y in years_present:
        try:
            starts.append(int(str(y).split("-")[0]))
        except (ValueError, AttributeError):
            continue
    if not starts:
        return []
    return [f"{y}-{y+1}" for y in range(min(starts), max(starts) + 1)]


def _clean_display_name(name) -> str | None:
    """Collapse `Name|Name|Name` → `Name` when the parts are the same after
    case-insensitive trim. Leaves genuinely different fuzzy-cluster names
    alone (returns the first part — not the concatenated mess)."""
    if not name:
        return None
    s = str(name)
    if "|" not in s:
        return s
    parts = [p.strip() for p in s.split("|") if p.strip()]
    if not parts:
        return s
    return parts[0]


def timeline(
    df: pd.DataFrame,
    top_n: int = 10,
    sectors: list[str] | None = None,
    exclude_noncorp: bool = True,
    min_award: float = 100_000,
) -> dict:
    """
    Grants-as-leading-indicator view: top-N recipients in government-buying
    sectors with a yearly funding breakdown per entity.

    Prefixes may be any length (e.g. "54" matches the whole sector, "5415"
    narrows to Computer Systems Design). Default is a tight B2G software /
    engineering / R&D slice that plausibly competes for IT procurement RFPs,
    with a $100K minimum so sub-capability "micro-grants" don't crowd out
    companies actually building things.
    """
    # Narrow default: Computer Systems Design (5415), Mgmt Consulting (54161),
    # Engineering services (54133), Software Publishers (5112), Data Processing
    # (5182), Physical/Engineering/Life-Science R&D (54171).
    sectors = sectors or ["5415", "54161", "54133", "5112", "5182", "54171"]
    naics = df["naics_code"].fillna("").astype(str)
    match_mask = pd.Series(False, index=df.index)
    for prefix in sectors:
        match_mask |= naics.str.startswith(prefix)
    filt = df[match_mask & df["award_value"].notna() & (df["award_value"] >= min_award)]
    if filt.empty:
        return {"recipients": [], "years": []}

    if exclude_noncorp:
        corp_mask = filt["recipient_name"].apply(_is_corporate)
        filt = filt[corp_mask]
        if filt.empty:
            return {"recipients": [], "years": []}

    totals = (
        filt.groupby(["entity_id", "recipient_name", "recipient_province"])
        ["award_value"].sum()
        .reset_index()
        .sort_values("award_value", ascending=False)
        .head(top_n)
    )

    years = _fill_fy_range(filt["fiscal_year"].dropna().unique().tolist())

    recipients = []
    for rank, (_, row) in enumerate(totals.iterrows(), 1):
        eid = row["entity_id"]
        sub = filt[filt["entity_id"] == eid]
        yearly_grouped = (
            sub.groupby("fiscal_year")
            .agg(value=("award_value", "sum"), count=("source_ref", "count"))
        )
        yearly = [
            {
                "fy": y,
                "value": float(yearly_grouped.at[y, "value"]) if y in yearly_grouped.index else 0.0,
                "count": int(yearly_grouped.at[y, "count"]) if y in yearly_grouped.index else 0,
            }
            for y in years
        ]
        naics_code = sub["naics_code"].dropna().astype(str).iloc[0] if sub["naics_code"].notna().any() else ""
        naics2_code = naics_code[:2]
        top_program = sub["program_name"].dropna().value_counts()
        top_department = sub["department"].dropna().value_counts()
        v = float(row["award_value"])
        recipients.append({
            "rank": rank,
            "entity_id": eid,
            "recipient_name": _clean_display_name(row["recipient_name"]),
            "province": row["recipient_province"],
            "sector_code": naics2_code,
            "sector_label": NAICS_SECTORS.get(naics2_code, "—"),
            "total_funding": v,
            "total_funding_fmt": f"${v/1e6:.1f}M" if v >= 1e6 else f"${v/1e3:.0f}K",
            "grant_count": int(len(sub)),
            "first_year": sub["fiscal_year"].dropna().min() if sub["fiscal_year"].notna().any() else None,
            "latest_year": sub["fiscal_year"].dropna().max() if sub["fiscal_year"].notna().any() else None,
            "top_program": _clean_display_name(top_program.index[0]) if len(top_program) else None,
            "top_department": _clean_display_name(top_department.index[0]) if len(top_department) else None,
            "yearly": yearly,
        })

    return {"recipients": recipients, "years": years}


def overview_stats(df: pd.DataFrame) -> dict:
    total_awards = len(df)
    total_funding = float(df["award_value"].fillna(0).sum())
    unique_recipients = int(df["entity_id"].nunique())
    naics_coverage = float(df["naics_code"].notna().mean())
    provinces_covered = int(df["recipient_province"].nunique())
    fiscal_years = sorted(df["fiscal_year"].dropna().unique().tolist())
    year_range = f"{fiscal_years[0]} – {fiscal_years[-1]}" if fiscal_years else "—"

    return {
        "total_awards": total_awards,
        "total_funding": total_funding,
        "total_funding_fmt": f"${total_funding/1e9:.1f}B" if total_funding >= 1e9 else f"${total_funding/1e6:.0f}M",
        "unique_recipients": unique_recipients,
        "naics_coverage_pct": round(naics_coverage * 100, 1),
        "provinces_covered": provinces_covered,
        "year_range": year_range,
    }
