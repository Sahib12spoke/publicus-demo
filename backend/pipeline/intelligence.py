"""The four intelligence query functions that power the dashboard."""

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
