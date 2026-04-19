"""Full pipeline orchestrator."""

import logging

import pandas as pd

from .ingestion import fetch_federal_grants
from .normalization import normalize_federal, normalize_alberta, CANONICAL_FIELDS
from .deduplication import deduplicate_exact, detect_cross_source_duplicates
from .consolidation import consolidate_amendments, run_qa
from .entity_resolution import resolve_entities
from .programs_scraper import build_programs_df

log = logging.getLogger(__name__)


def run_pipeline(federal_limit: int = 10_000) -> tuple[pd.DataFrame, list[dict], pd.DataFrame]:
    """
    Full pipeline: ingest → normalize → merge → dedup → amend → entity → QA.
    Also runs the programs scraper in parallel (independent of awards data).

    Returns (clean_df, qa_report, programs_df).
    """
    log.info("=== PIPELINE START (federal_limit=%d) ===", federal_limit)

    # 1. Ingest awards data
    federal_raw = fetch_federal_grants(limit=federal_limit)
    if federal_raw.empty:
        log.warning("No federal data fetched — returning empty DataFrame")
        return pd.DataFrame(columns=CANONICAL_FIELDS), [], pd.DataFrame()

    # 2. Normalize per source
    log.info("Normalizing %d federal records...", len(federal_raw))
    federal_norm = pd.DataFrame([normalize_federal(row) for _, row in federal_raw.iterrows()])

    # 3. Merge all sources
    merged = federal_norm  # Alberta added when real API is configured

    # 4. Deduplicate
    after_exact = deduplicate_exact(merged)
    after_cross = detect_cross_source_duplicates(after_exact)

    # 5. Consolidate amendments
    consolidated = consolidate_amendments(after_cross)

    # 6. Entity resolution
    resolved = resolve_entities(consolidated)

    # 7. QA
    qa_report = run_qa(resolved)
    errors = sum(r["flagged"] for r in qa_report if r["severity"] == "error" and r["flagged"] > 0)
    warnings = sum(r["flagged"] for r in qa_report if r["severity"] == "warning" and r["flagged"] > 0)
    log.info("QA: %d errors, %d warnings", errors, warnings)

    log.info("=== PIPELINE COMPLETE: %d clean records ===", len(resolved))

    # 8. Scrape program pages (unstructured pipeline — independent of awards)
    log.info("Running programs scraper...")
    try:
        programs_df = build_programs_df()
    except Exception as exc:
        log.warning("Programs scraper failed: %s — continuing without program metadata", exc)
        programs_df = pd.DataFrame()

    return resolved, qa_report, programs_df
