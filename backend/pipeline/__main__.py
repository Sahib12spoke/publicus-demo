"""
Pipeline CLI — run offline processing and save output to parquet cache.

Usage:
    # From the backend/ directory:
    python -m pipeline run                        # read local CSV (default)
    python -m pipeline run --fetch                # re-download from CKAN instead
    python -m pipeline run --skip-programs        # skip HTML scraper
    python -m pipeline info                       # show current cache status

Data source priority:
  1. data/federal_grants_raw.csv (local file, instant)  ← default
  2. CKAN DataStore API + bulk CSV fallback              ← only with --fetch

The dashboard (FastAPI) loads from the parquet cache on startup and never
re-runs the pipeline. Re-run this script whenever you want to refresh the data.
"""

import argparse
import logging
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline.cli")

# __main__.py lives at: grant_radar/backend/pipeline/__main__.py
# parents[0] = pipeline/, parents[1] = backend/, parents[2] = grant_radar/
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOCAL_CSV = _PROJECT_ROOT / "data" / "federal_grants_raw.csv"


def _load_local_csv() -> "pd.DataFrame":
    import pandas as pd
    log.info("Loading local CSV: %s (%.0f MB)…", LOCAL_CSV, LOCAL_CSV.stat().st_size / 1e6)
    t = time.perf_counter()
    df = pd.read_csv(LOCAL_CSV, low_memory=False)
    df.columns = [c.lower().strip() for c in df.columns]
    log.info("  Loaded %d rows in %.1fs", len(df), time.perf_counter() - t)
    return df


def _run(fetch: bool, skip_programs: bool) -> None:
    from pipeline.normalization import normalize_federal
    from pipeline.deduplication import deduplicate_exact, detect_cross_source_duplicates
    from pipeline.consolidation import consolidate_amendments, run_qa
    from pipeline.entity_resolution import resolve_entities
    from pipeline.programs_scraper import build_programs_df
    from pipeline.cache import save
    import pandas as pd

    t0 = time.perf_counter()

    # ── 1. Ingest ──────────────────────────────────────────────────────────────
    if fetch:
        log.info("Step 1/7 — Fetching from CKAN (no local CSV requested)…")
        from pipeline.ingestion import fetch_federal_grants
        federal_raw = fetch_federal_grants(limit=0)  # 0 = all records
        if federal_raw.empty:
            log.error("No data fetched from CKAN — aborting.")
            sys.exit(1)
    else:
        if not LOCAL_CSV.exists():
            log.error(
                "Local CSV not found at %s\n"
                "  Either place the file there, or use --fetch to download from CKAN.",
                LOCAL_CSV,
            )
            sys.exit(1)
        federal_raw = _load_local_csv()

    log.info("Step 1/7 — Ingestion complete: %d raw records", len(federal_raw))

    # ── 2. Normalize ──────────────────────────────────────────────────────────
    log.info("Step 2/7 — Normalizing %d records…", len(federal_raw))
    t2 = time.perf_counter()
    federal_norm = pd.DataFrame(
        [normalize_federal(row) for _, row in federal_raw.iterrows()]
    )
    log.info("  done in %.1fs", time.perf_counter() - t2)

    # ── 3. Merge sources ───────────────────────────────────────────────────────
    log.info("Step 3/7 — Merging sources…")
    merged = federal_norm  # Alberta added when available

    # ── 4. Deduplicate ────────────────────────────────────────────────────────
    log.info("Step 4/7 — Deduplicating…")
    after_exact = deduplicate_exact(merged)
    after_cross = detect_cross_source_duplicates(after_exact)
    log.info(
        "  %d → exact dedup → %d → cross-source dedup → %d",
        len(merged), len(after_exact), len(after_cross),
    )

    # ── 5. Consolidate amendments ─────────────────────────────────────────────
    log.info("Step 5/7 — Consolidating amendments…")
    consolidated = consolidate_amendments(after_cross)
    log.info("  %d records after amendment consolidation", len(consolidated))

    # ── 6. Entity resolution ──────────────────────────────────────────────────
    log.info("Step 6/7 — Resolving entities (BN → fuzzy → singletons)…")
    t6 = time.perf_counter()
    resolved = resolve_entities(consolidated)
    log.info("  entity resolution done in %.1fs", time.perf_counter() - t6)

    # ── 7. QA ─────────────────────────────────────────────────────────────────
    log.info("Step 7/7 — Running QA checks…")
    qa_report = run_qa(resolved)
    errors   = sum(r["flagged"] for r in qa_report if r["severity"] == "error"   and r["flagged"] > 0)
    warnings = sum(r["flagged"] for r in qa_report if r["severity"] == "warning" and r["flagged"] > 0)
    log.info("  QA: %d errors, %d warnings", errors, warnings)

    # ── Programs scraper ───────────────────────────────────────────────────────
    if skip_programs:
        log.info("Programs scraper skipped (--skip-programs)")
        programs_df = pd.DataFrame()
    else:
        log.info("Programs — scraping government HTML pages…")
        try:
            programs_df = build_programs_df()
        except Exception as exc:
            log.warning("Programs scraper failed: %s — saving empty programs table", exc)
            programs_df = pd.DataFrame()

    # ── Save cache ────────────────────────────────────────────────────────────
    cache_dir = save(resolved, programs_df, qa_report)

    elapsed = time.perf_counter() - t0
    log.info(
        "Pipeline complete — %d awards, %d programs saved to %s (%.1fs total)",
        len(resolved),
        len(programs_df),
        cache_dir,
        elapsed,
    )


def _info() -> None:
    from pipeline.cache import cache_info
    info = cache_info()
    print("\nCache status:")
    for k, v in info.items():
        print(f"  {k:<20} {v}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline",
        description="Grant Radar pipeline — process local CSV, serve fast.",
    )
    sub = parser.add_subparsers(dest="command")

    run_cmd = sub.add_parser("run", help="Run the full pipeline and save to cache")
    run_cmd.add_argument(
        "--fetch", action="store_true",
        help="Download fresh data from CKAN instead of using the local CSV",
    )
    run_cmd.add_argument(
        "--skip-programs", action="store_true",
        help="Skip the HTML program scraper (faster, no program metadata)",
    )

    sub.add_parser("info", help="Show current cache status")

    args = parser.parse_args()

    if args.command == "run":
        _run(fetch=args.fetch, skip_programs=args.skip_programs)
    elif args.command == "info":
        _info()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
