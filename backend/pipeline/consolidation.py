"""Amendment consolidation and QA checks."""

import logging
import pandas as pd

log = logging.getLogger(__name__)


def consolidate_amendments(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["source_amendment_num"] = (
        pd.to_numeric(df["source_amendment_num"], errors="coerce").fillna(0).astype(int)
    )
    latest_idx = df.groupby("source_ref")["source_amendment_num"].idxmax()
    consolidated = df.loc[latest_idx].copy()
    consolidated["is_amended"] = consolidated["source_ref"].isin(
        df.groupby("source_ref")["source_amendment_num"].max().pipe(lambda s: s[s > 0]).index
    )
    log.info("Amendments: %d → %d records", len(df), len(consolidated))
    return consolidated


QA_RULES = [
    {
        "name": "negative_award",
        "desc": "Award value is zero or negative",
        "check": lambda df: df["award_value"].fillna(0) <= 0,
        "severity": "error",
    },
    {
        "name": "implausibly_large",
        "desc": "Award value > $500M",
        "check": lambda df: df["award_value"].fillna(0) > 5e8,
        "severity": "warning",
    },
    {
        "name": "missing_recipient",
        "desc": "Recipient name is missing",
        "check": lambda df: df["recipient_name"].isna(),
        "severity": "error",
    },
    {
        "name": "unknown_province",
        "desc": "Province could not be normalized",
        "check": lambda df: df["recipient_province"].isna(),
        "severity": "warning",
    },
]


def run_qa(df: pd.DataFrame) -> list[dict]:
    results = []
    for rule in QA_RULES:
        try:
            n = int(rule["check"](df).sum())
        except Exception:
            n = -1
        results.append({
            "rule": rule["name"],
            "description": rule["desc"],
            "severity": rule["severity"],
            "flagged": n,
            "pct": round(n / len(df) * 100, 2) if n >= 0 else None,
        })
    return results
