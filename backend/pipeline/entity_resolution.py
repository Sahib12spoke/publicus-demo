"""
Entity resolution: BN matching → fuzzy name matching → singletons.

Tier 1: Exact Business Number (BN) match — most reliable signal.
Tier 2: Fuzzy name match within (province, name-prefix) blocks using
        rapidfuzz.process.cdist() — vectorised C extension, ~100× faster
        than nested Python loops.
Tier 3: Singletons — each remaining record gets its own unique entity_id.

Blocking strategy:
  - Primary block:   recipient_province (~13 blocks)
  - Secondary block: first character of normalised name (~26 sub-blocks)
  This two-level blocking reduces the number of pairs compared per group
  by ~13 × ~15 = ~200× compared to a global O(n²) scan while keeping
  near-perfect recall for real duplicates (same entity rarely spans
  different provinces or starts with a different first letter).
"""

import hashlib
import logging

import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process

from .normalization import normalize_name_for_matching

log = logging.getLogger(__name__)

FUZZY_AUTO_MERGE = 0.92   # ≥ this → auto-merge
FUZZY_REVIEW_BAND = 0.85  # ≥ this, < FUZZY_AUTO_MERGE → flag for human review


def _merge_block(
    df: pd.DataFrame,
    idxs: list,
    norms: list,
) -> None:
    """
    Run vectorised fuzzy matching on a single (province, prefix) block.
    Modifies df in place: sets entity_id and entity_match_tier for merged rows,
    and review_flag for uncertain pairs.

    Uses process.cdist() which computes the full score matrix in one
    C-extension call — orders of magnitude faster than Python nested loops.
    """
    n = len(idxs)
    if n < 2:
        return

    # Compute full n×n score matrix (upper triangle only matters)
    score_matrix = process.cdist(norms, norms, scorer=fuzz.token_sort_ratio) / 100.0

    for i in range(n):
        for j in range(i + 1, n):
            if not norms[i] or not norms[j]:
                continue
            score = score_matrix[i, j]

            if score >= FUZZY_AUTO_MERGE:
                # Use existing entity_id if one already exists (chain merges)
                eid = df.at[idxs[i], "entity_id"] or df.at[idxs[j], "entity_id"] or (
                    "E-" + hashlib.md5(f"fuzzy:{norms[i]}".encode()).hexdigest()[:10]
                )
                df.at[idxs[i], "entity_id"] = eid
                df.at[idxs[j], "entity_id"] = eid
                df.at[idxs[i], "entity_match_tier"] = 2
                df.at[idxs[j], "entity_match_tier"] = 2

            elif score >= FUZZY_REVIEW_BAND:
                # Flag the lower-indexed record for human review
                existing = df.at[idxs[i], "review_flag"]
                if not existing:
                    df.at[idxs[i], "review_flag"] = f"possible_match:{norms[j]}:{score:.2f}"


def resolve_entities(df: pd.DataFrame) -> pd.DataFrame:
    """
    Full 3-tier entity resolution pipeline.

    Returns df with two new columns:
      entity_id          — stable hash-based identifier
      entity_match_tier  — 1 = BN, 2 = fuzzy, 3 = singleton
    """
    df = df.copy()
    df["entity_id"] = None
    df["entity_match_tier"] = None
    if "review_flag" not in df.columns:
        df["review_flag"] = None

    # ── Tier 1: Exact Business Number ────────────────────────────────────────
    valid_bn = df["recipient_bn"].str.match(r"^\d{9}$", na=False)
    for bn, grp in df[valid_bn].groupby("recipient_bn"):
        eid = "E-" + hashlib.md5(f"bn:{bn}".encode()).hexdigest()[:10]
        df.loc[grp.index, "entity_id"] = eid
        df.loc[grp.index, "entity_match_tier"] = 1
    t1_count = int(valid_bn.sum())
    log.info("Tier 1 (BN): %d records matched", t1_count)

    # ── Tier 2: Vectorised fuzzy matching with two-level blocking ─────────────
    unmatched = df[df["entity_id"].isna()].copy()
    unmatched["_norm"] = unmatched["recipient_name"].apply(normalize_name_for_matching)
    # Secondary block key: first character of normalised name (or "_" if empty)
    unmatched["_prefix"] = unmatched["_norm"].str[:1].fillna("_")

    total_blocks = 0
    total_pairs = 0

    for (province, prefix), grp in unmatched.groupby(
        ["recipient_province", "_prefix"], dropna=False
    ):
        idxs = grp.index.tolist()
        norms = grp["_norm"].tolist()
        n = len(idxs)
        if n < 2:
            continue
        total_blocks += 1
        total_pairs += n * (n - 1) // 2
        _merge_block(df, idxs, norms)

    log.info(
        "Tier 2 (Fuzzy): %d blocks, %d pairs evaluated",
        total_blocks,
        total_pairs,
    )

    # ── Tier 3: Singletons ───────────────────────────────────────────────────
    # Hash on (recipient_name, recipient_province) so identical recipients in
    # different rows collapse to one entity. Fall back to row idx only when
    # recipient_name is missing (genuinely unidentifiable rows stay separate).
    singleton_mask = df["entity_id"].isna()
    for idx in df[singleton_mask].index:
        name = df.at[idx, "recipient_name"]
        prov = df.at[idx, "recipient_province"] or ""
        key = f"s:{name}:{prov}" if name else f"s::{idx}"
        df.at[idx, "entity_id"] = "E-" + hashlib.md5(key.encode()).hexdigest()[:10]
        df.at[idx, "entity_match_tier"] = 3

    # ── Summary ──────────────────────────────────────────────────────────────
    for tier, label in [(1, "BN"), (2, "Fuzzy"), (3, "Singleton")]:
        n = int((df["entity_match_tier"] == tier).sum())
        log.info("  Tier %d (%s): %d records", tier, label, n)
    flagged = int(df["review_flag"].notna().sum())
    log.info("  Flagged for review: %d", flagged)

    return df.drop(columns=["_norm", "_prefix"], errors="ignore")
