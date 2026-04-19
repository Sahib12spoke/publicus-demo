"""Exact and cross-source deduplication."""

import logging

import numpy as np
import pandas as pd
from rapidfuzz import fuzz

from .normalization import normalize_name_for_matching

log = logging.getLogger(__name__)

SOURCE_PRIORITY = {"federal": 0, "alberta": 1, "montreal": 2}


def deduplicate_exact(df: pd.DataFrame) -> pd.DataFrame:
    before = len(df)
    key_cols = [c for c in ["source", "source_ref", "source_amendment_num"] if c in df.columns]
    df = df.drop_duplicates(subset=key_cols, keep="first")
    content_cols = [c for c in df.columns if c not in ("processed_at", "pipeline_version", "entity_id")]
    df = df.drop_duplicates(subset=content_cols, keep="first")
    log.info("Exact dedup: %d → %d (-%d)", before, len(df), before - len(df))
    return df.copy()


def detect_cross_source_duplicates(
    df: pd.DataFrame,
    name_threshold: float = 0.90,
    value_tolerance: float = 0.05,
) -> pd.DataFrame:
    if df["source"].nunique() < 2:
        return df

    df = df.copy()
    df["_norm_name"] = df["recipient_name"].apply(normalize_name_for_matching)
    df["_priority"] = df["source"].map(SOURCE_PRIORITY).fillna(99)

    drop_indices: set = set()

    for (province, fy), grp in df.groupby(["recipient_province", "fiscal_year"], dropna=False):
        if grp["source"].nunique() < 2:
            continue
        idxs = grp.index.tolist()
        names = grp["_norm_name"].tolist()
        values = grp["award_value"].tolist()
        sources = grp["source"].tolist()

        for i in range(len(idxs)):
            for j in range(i + 1, len(idxs)):
                if sources[i] == sources[j] or not names[i] or not names[j]:
                    continue
                if fuzz.token_sort_ratio(names[i], names[j]) / 100.0 < name_threshold:
                    continue
                v1, v2 = values[i] or 0, values[j] or 0
                if v1 > 0 and v2 > 0 and abs(v1 - v2) / max(v1, v2) > value_tolerance:
                    continue
                pri_i = df.at[idxs[i], "_priority"]
                pri_j = df.at[idxs[j], "_priority"]
                drop_indices.add(idxs[j] if pri_i <= pri_j else idxs[i])

    result = df.drop(index=list(drop_indices)).drop(columns=["_norm_name", "_priority"])
    log.info("Cross-source dedup: %d → %d (-%d)", len(df), len(result), len(drop_indices))
    return result
