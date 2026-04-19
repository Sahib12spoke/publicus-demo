"""
Unstructured data pipeline — scrape government program pages into structured records.

Methodology (no LLM required):
  1. fetch_html()       — download static government HTML pages
  2. parse_raw_blocks() — extract labelled text blocks via BeautifulSoup
  3. extract_fields()   — rule-based heuristics: regex amounts, keyword NAICS, signal sentences
  4. build_programs_df()— assemble into a canonical DataFrame

The resulting programs_df can be joined to awards_df via:
  - Signal 1: keyword match on award program_name columns
  - Signal 2: NAICS code overlap

This pipeline demonstrates processing of unstructured data sources and integrating
them with structured award data from the CKAN API.
"""

import re
import time
import logging
from typing import Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

# ── Target program pages (ISED static HTML — confirmed accessible) ─────────────
PROGRAM_PAGES = [
    {
        "url": "https://ised-isde.canada.ca/site/strategic-innovation-fund/en",
        "program_id": "SIF",
    },
    {
        "url": "https://ised-isde.canada.ca/site/canada-small-business-financing-program/en",
        "program_id": "CSBFP",
    },
    {
        "url": "https://ised-isde.canada.ca/site/accelerated-growth-service/en",
        "program_id": "AGS",
    },
    {
        "url": "https://ised-isde.canada.ca/site/innovative-solutions-canada/en",
        "program_id": "ISC",
    },
    {
        "url": "https://ised-isde.canada.ca/site/connect-to-innovate/en",
        "program_id": "CTI",
    },
]

# ── Extraction rules ───────────────────────────────────────────────────────────

# NAICS 6-digit codes → representative keywords for that sector
SECTOR_KEYWORDS: dict[str, list[str]] = {
    "541510": ["software", "IT", "technology", "digital", "cyber", "SaaS", "cloud", "AI", "machine learning"],
    "541330": ["engineering", "construction", "infrastructure", "clean energy", "aerospace"],
    "541711": ["research", "R&D", "innovation", "prototype", "laboratory", "experimental"],
    "311000": ["food", "agriculture", "agri-food", "seafood", "farming"],
    "336411": ["aerospace", "aviation", "aircraft", "defence"],
    "522110": ["financing", "loan", "lender", "financial institution", "credit"],
}

AMOUNT_RE = re.compile(
    r"\$\s?([\d,\.]+)\s*(million|billion|M|B|K)?\b",
    re.IGNORECASE,
)

ELIGIBILITY_SIGNALS = [
    "eligible", "eligib", "who can apply", "who qualifies",
    "businesses that", "companies that", "applicants must",
    "you must", "requirements", "criteria",
]

PROGRAM_TYPE_MAP = {
    "loan":       ["loan", "lending", "lender", "financing", "line of credit"],
    "tax_credit": ["tax credit", "tax incentive", "ITC", "refundable"],
    "grant":      ["grant", "non-repayable", "contribution", "funding"],
    "repayable":  ["repayable", "conditionally repayable"],
}

CLOSED_SIGNALS = ["no longer accepting", "closed", "program has ended", "discontinued"]


# ── Step 1: Fetch ──────────────────────────────────────────────────────────────

def fetch_html(url: str, timeout: int = 15) -> str:
    """Download a page and return raw HTML. Returns empty string on failure."""
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (compatible; GrantRadar/1.0)"},
        )
        resp.raise_for_status()
        return resp.text
    except Exception as exc:
        log.warning("SKIP %s: %s", url, exc)
        return ""


# ── Step 2: Parse ─────────────────────────────────────────────────────────────

def parse_raw_blocks(html: str) -> dict:
    """
    Parse government HTML into labelled text blocks.
    Targets the <main> / #wb-cont region to strip nav/footer noise.
    Returns: {h1, h2s, h3s, paragraphs, list_items, all_text}
    """
    soup = BeautifulSoup(html, "lxml")
    main = soup.find("main") or soup.find("div", id="wb-cont") or soup

    h1 = main.find("h1")
    h1_text = h1.get_text(" ", strip=True) if h1 else ""

    h2s = [tag.get_text(" ", strip=True) for tag in main.find_all("h2")]
    h3s = [tag.get_text(" ", strip=True) for tag in main.find_all("h3")]

    paras = [
        tag.get_text(" ", strip=True)
        for tag in main.find_all("p")
        if len(tag.get_text(strip=True)) > 40
    ]

    list_items = [
        li.get_text(" ", strip=True)
        for li in main.find_all("li")
        if len(li.get_text(strip=True)) > 20
    ]

    all_text = " ".join([h1_text] + paras + list_items)

    return {
        "h1": h1_text,
        "h2s": h2s,
        "h3s": h3s,
        "paragraphs": paras,
        "list_items": list_items,
        "all_text": all_text,
    }


# ── Step 3: Extract fields ────────────────────────────────────────────────────

def _parse_amount(raw: str, unit: str) -> Optional[float]:
    """Convert ('500', 'million') → 500_000_000.0."""
    try:
        val = float(raw.replace(",", ""))
        unit = (unit or "").strip().lower()
        if unit in ("billion", "b"):
            val *= 1e9
        elif unit in ("million", "m"):
            val *= 1e6
        elif unit == "k":
            val *= 1e3
        return val
    except ValueError:
        return None


def extract_fields(pid: str, url: str, blocks: dict) -> dict:
    """
    Convert parsed HTML blocks → a canonical program record.

    Output fields:
      program_id, program_name, description, eligibility_text,
      program_type, min_funding, max_funding, naics_codes,
      naics_keywords, province_scope, status, source_url
    """
    text = blocks["all_text"].lower()

    # program_name: h1 is authoritative on government pages
    program_name = blocks["h1"] or pid

    # description: first 2 substantive paragraphs
    desc_paras = [p for p in blocks["paragraphs"] if len(p) > 80][:2]
    description = " ".join(desc_paras)

    # eligibility: paragraphs/bullets containing signal phrases
    elig_sentences = [
        sent
        for sent in (blocks["paragraphs"] + blocks["list_items"])
        if any(sig in sent.lower() for sig in ELIGIBILITY_SIGNALS)
    ][:4]
    eligibility_text = " | ".join(elig_sentences) if elig_sentences else None

    # funding amounts: regex over full page text
    amounts = [
        _parse_amount(m.group(1), m.group(2) or "")
        for m in AMOUNT_RE.finditer(blocks["all_text"])
    ]
    amounts = sorted({a for a in amounts if a and a > 0})
    min_funding = amounts[0] if amounts else None
    max_funding = amounts[-1] if amounts else None

    # program_type: keyword vote across type map
    type_scores = {
        t: sum(1 for kw in kws if kw.lower() in text)
        for t, kws in PROGRAM_TYPE_MAP.items()
    }
    program_type = max(type_scores, key=type_scores.get)
    if type_scores[program_type] == 0:
        program_type = "grant"

    # NAICS: keyword overlap with sector map
    matched_naics: list[str] = []
    matched_keywords: list[str] = []
    for naics_code, kws in SECTOR_KEYWORDS.items():
        hits = [kw for kw in kws if kw.lower() in text]
        if hits:
            matched_naics.append(naics_code)
            matched_keywords.extend(hits)
    matched_keywords = list(dict.fromkeys(matched_keywords))  # dedupe, preserve order

    # province scope: PacifiCan = BC; ISED = federal (all provinces)
    province_scope = ["BC"] if "pacific" in url.lower() else ["ALL"]

    # status: scan for closed/discontinued signals
    status = "closed" if any(s in text for s in CLOSED_SIGNALS) else "open"

    return {
        "program_id":       pid,
        "program_name":     program_name,
        "description":      description[:500] if description else None,
        "eligibility_text": eligibility_text[:600] if eligibility_text else None,
        "program_type":     program_type,
        "min_funding":      min_funding,
        "max_funding":      max_funding,
        "naics_codes":      matched_naics,
        "naics_keywords":   matched_keywords,
        "province_scope":   province_scope,
        "status":           status,
        "source_url":       url,
    }


# ── Step 4: Build DataFrame ───────────────────────────────────────────────────

def build_programs_df(
    pages: list[dict] = PROGRAM_PAGES,
    request_delay: float = 0.5,
) -> pd.DataFrame:
    """
    Fetch and parse all program pages, returning a programs_df with one row
    per program. Gracefully skips pages that fail to load.
    """
    records: list[dict] = []

    for page in pages:
        pid = page["program_id"]
        url = page["url"]
        log.info("Scraping program page: %s (%s)", pid, url)

        html = fetch_html(url)
        if not html:
            log.warning("Skipping %s — no HTML returned", pid)
            continue

        blocks = parse_raw_blocks(html)
        record = extract_fields(pid, url, blocks)
        records.append(record)
        log.info("  OK — name=%r, type=%s, status=%s", record["program_name"], record["program_type"], record["status"])
        time.sleep(request_delay)

    if not records:
        log.warning("No program pages scraped successfully — returning empty DataFrame")
        return pd.DataFrame(columns=[
            "program_id", "program_name", "description", "eligibility_text",
            "program_type", "min_funding", "max_funding", "naics_codes",
            "naics_keywords", "province_scope", "status", "source_url",
        ])

    df = pd.DataFrame(records)
    log.info("Programs scraped: %d records", len(df))
    return df


# ── Integration helpers ───────────────────────────────────────────────────────

def build_name_keyword_index(programs_df: pd.DataFrame) -> dict[str, str]:
    """
    Build {word → program_id} index for fast program_name keyword matching.
    Only indexes words longer than 4 characters to avoid noise from stop words.
    """
    index: dict[str, str] = {}
    for _, prog in programs_df.iterrows():
        for word in str(prog["program_name"]).lower().split():
            if len(word) > 4:
                index[word] = prog["program_id"]
    return index


def build_naics_index(programs_df: pd.DataFrame) -> dict[str, list[str]]:
    """Build {naics_code → [program_id, ...]} index."""
    index: dict[str, list[str]] = {}
    for _, prog in programs_df.iterrows():
        for code in (prog["naics_codes"] or []):
            index.setdefault(code, []).append(prog["program_id"])
    return index


def match_awards_to_programs(
    awards_df: pd.DataFrame,
    programs_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Annotate awards_df with matched program IDs using two signals:
      1. Keyword match on award program_name column
      2. NAICS code overlap

    Returns awards_df with two new columns:
      matched_program_by_name    — str | None
      matched_programs_by_naics  — list[str]
    """
    if programs_df.empty:
        awards_df = awards_df.copy()
        awards_df["matched_program_by_name"] = None
        awards_df["matched_programs_by_naics"] = [[] for _ in range(len(awards_df))]
        return awards_df

    name_index = build_name_keyword_index(programs_df)
    naics_index = build_naics_index(programs_df)

    def _match_by_name(raw_name) -> Optional[str]:
        if not isinstance(raw_name, str):
            return None
        for word in raw_name.lower().split():
            if word in name_index:
                return name_index[word]
        return None

    def _match_by_naics(naics_code) -> list[str]:
        if not isinstance(naics_code, str):
            return []
        return naics_index.get(naics_code, naics_index.get(naics_code[:4], []))

    awards = awards_df.copy()

    # Try program_name column (may be None if not available in raw CSV)
    prog_name_col = next(
        (c for c in awards.columns if c in ("program_name", "prog_name_en")),
        None,
    )
    naics_col = next(
        (c for c in awards.columns if c in ("naics_code", "naics_identifier")),
        None,
    )

    awards["matched_program_by_name"] = (
        awards[prog_name_col].apply(_match_by_name) if prog_name_col else None
    )
    awards["matched_programs_by_naics"] = (
        awards[naics_col].apply(_match_by_naics) if naics_col else [[] for _ in range(len(awards))]
    )

    return awards
