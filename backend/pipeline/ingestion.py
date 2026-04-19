"""Fetch raw data from CKAN (federal) — DataStore API with bulk CSV fallback."""

import io
import logging
import time

import requests
import pandas as pd

from .constants import CKAN_BASE, GRANTS_PACKAGE_ID

log = logging.getLogger(__name__)

# Bulk CSV dump — always available even when the DataStore API returns 0 records
# (DataStore is refreshed quarterly and can be temporarily empty)
BULK_CSV_URL = (
    "https://open.canada.ca/data/dataset/432527ab-7aac-45b5-81d6-7597107a7013"
    "/resource/1d15a62f-5656-49ad-8c88-f40ce689d831/download/grants.csv"
)


def _get_grants_resource_id() -> str:
    resp = requests.get(
        f"{CKAN_BASE}/package_show",
        params={"id": GRANTS_PACKAGE_ID},
        timeout=30,
    )
    resp.raise_for_status()
    resources = resp.json()["result"]["resources"]
    csv_resources = [r for r in resources if r.get("format", "").upper() == "CSV"]
    main = sorted(csv_resources, key=lambda r: r.get("size", 0) or 0, reverse=True)[0]
    return main["id"]


def _fetch_via_datastore(limit: int) -> pd.DataFrame:
    """Fetch records via CKAN DataStore API. Returns empty DataFrame if unavailable."""
    log.info("Resolving CKAN resource ID...")
    resource_id = _get_grants_resource_id()
    log.info("Resource ID: %s", resource_id)

    frames = []
    offset = 0
    page_size = 5_000
    total_target = limit if limit > 0 else float("inf")

    while offset < total_target:
        batch = min(page_size, int(total_target - offset))
        resp = requests.get(
            f"{CKAN_BASE}/datastore_search",
            params={"resource_id": resource_id, "limit": batch, "offset": offset},
            timeout=60,
        )
        resp.raise_for_status()
        result = resp.json()["result"]
        records = result["records"]
        if not records:
            break
        frames.append(pd.DataFrame(records))
        offset += len(records)
        total_available = result.get("total", offset)
        log.info(
            "Fetched %d / %d",
            min(offset, total_available),
            min(int(total_target), total_available),
        )
        if offset >= total_available:
            break
        time.sleep(0.4)  # ~2.5 req/s — polite

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _fetch_via_bulk_csv(limit: int, chunk_size: int = 65_536) -> pd.DataFrame:
    """
    Stream the bulk CSV dump and return up to `limit` rows.
    Reads in 64 KB chunks, stopping once we have enough data.
    """
    log.info("Falling back to bulk CSV stream (limit=%d)...", limit)
    resp = requests.get(BULK_CSV_URL, stream=True, timeout=300,
                        headers={"User-Agent": "GrantRadar/1.0 (data pipeline)"})
    resp.raise_for_status()

    chunks: list[bytes] = []
    rows_estimate = 0
    for raw_chunk in resp.iter_content(chunk_size):
        chunks.append(raw_chunk)
        # Rough row estimate: ~300 bytes per row on average
        rows_estimate = sum(len(c) for c in chunks) // 300
        if limit > 0 and rows_estimate >= limit * 1.1:
            break

    raw = b"".join(chunks).decode("utf-8-sig", errors="replace")
    # Drop the last (possibly incomplete) line before parsing
    raw = raw[: raw.rfind("\n")]

    df = pd.read_csv(io.StringIO(raw), on_bad_lines="skip", low_memory=False)
    # Normalise column names to lowercase (CSV header varies)
    df.columns = [c.lower().strip() for c in df.columns]

    if limit > 0 and len(df) > limit:
        df = df.head(limit)

    log.info("Bulk CSV: %d raw records loaded", len(df))
    return df


def fetch_federal_grants(limit: int = 10_000) -> pd.DataFrame:
    """
    Fetch records from the Open Canada CKAN DataStore.
    Falls back to bulk CSV streaming when the DataStore returns 0 records
    (this happens during quarterly refreshes).

    limit: max records to fetch (use 0 for all ~500K — slow).
    """
    try:
        df = _fetch_via_datastore(limit)
        if not df.empty:
            log.info("Federal (DataStore): %d raw records", len(df))
            # Normalise column names
            df.columns = [c.lower().strip() for c in df.columns]
            return df
        log.warning("DataStore returned 0 records — switching to bulk CSV fallback")
    except Exception as exc:
        log.warning("DataStore fetch failed (%s) — switching to bulk CSV fallback", exc)

    return _fetch_via_bulk_csv(limit)
