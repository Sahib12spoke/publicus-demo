"""Field-level cleaning and per-source normalization functions."""

import re
import hashlib
from datetime import datetime

import pandas as pd

from .constants import (
    CANONICAL_FIELDS, PIPELINE_VERSION, NAICS_SECTORS,
    NAICS_KEYWORD_RULES, PROVINCE_MAP,
)

# ── Canonical regexes ─────────────────────────────────────────────────────────
LEGAL_SUFFIXES = re.compile(
    r"\b(inc|incorporated|ltd|limited|llc|llp|lp|corp|corporation"
    r"|co|company|ltée|enr|s\.a\.|inc\.|ltd\.|corp\.)\b\.?\s*$",
    re.IGNORECASE,
)
CANADIAN_PC = re.compile(r"^([A-Z]\d[A-Z])\s*(\d[A-Z]\d)$", re.IGNORECASE)
US_ZIP = re.compile(r"^\d{5}(-\d{4})?$")
CITY_ALIASES = {
    "MONTERAL": "Montréal", "MONTREAL": "Montréal",
    "QUEBEC CITY": "Québec", "OTTAWA ON": "Ottawa",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _s(val) -> str | None:
    """Safe string coercion — turns NaN / None / empty string into None."""
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    s = str(val).strip()
    return s if s else None


def normalize_province(raw: str | None) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    clean = raw.strip()
    if clean in PROVINCE_MAP:
        return PROVINCE_MAP[clean]
    for k, v in PROVINCE_MAP.items():
        if k.upper() == clean.upper():
            return v
    return None


def normalize_fiscal_year(raw: str | None) -> str | None:
    if not isinstance(raw, str):
        return None
    raw = raw.strip().replace("/", "-")
    if re.match(r"^\d{4}-\d{4}$", raw):
        return raw
    m = re.match(r"^(\d{4})-(\d{2})$", raw)
    if m:
        start = int(m.group(1))
        return f"{start}-{start + 1}"
    m = re.match(r"^(\d{2})-(\d{2})$", raw)
    if m:
        start = 2000 + int(m.group(1))
        return f"{start}-{start + 1}"
    m = re.match(r"^(\d{4})$", raw)
    if m:
        end = int(m.group(1))
        return f"{end - 1}-{end}"
    return None


def normalize_postal_code(raw: str | None) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    raw = raw.strip().upper()
    m = CANADIAN_PC.match(raw)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    return None


def normalize_city(raw: str | None) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    city = raw.strip().title()
    upper = city.upper()
    if upper in CITY_ALIASES:
        return CITY_ALIASES[upper]
    return city


def normalize_amount(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        v = float(raw)
        return v if v > 0 else None
    s = re.sub(r"[$,\s]", "", str(raw).strip())
    s = re.sub(r"[A-Z]+$", "", s)
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


def normalize_name_for_matching(name: str) -> str:
    if not isinstance(name, str):
        return ""
    n = name.upper().strip()
    n = LEGAL_SUFFIXES.sub("", n)
    n = re.sub(r"[^A-Z0-9\s]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def resolve_bilingual(row, en_col: str, fr_col: str) -> tuple[str | None, str | None]:
    en = _s(row.get(en_col))
    fr = _s(row.get(fr_col))
    if en:
        return en, "en"
    if fr:
        return fr, "fr"
    return None, None


def clean_naics(raw: str | None) -> tuple[str | None, str | None, bool]:
    if not isinstance(raw, str) or not raw.strip():
        return None, None, False
    match = re.search(r"\b(\d{2,6})\b", raw)
    if not match:
        return None, None, False
    code = match.group(1)
    if len(code) not in (2, 4, 6):
        return None, None, False
    sector = NAICS_SECTORS.get(code[:2])
    return code, sector, True


def infer_naics_from_text(text: str, threshold: int = 2) -> tuple[str | None, int, list]:
    if not isinstance(text, str) or not text.strip():
        return None, 0, []
    text_lower = text.lower()
    scores: dict = {}
    for naics_code, keywords in NAICS_KEYWORD_RULES.items():
        hits = [kw for kw in keywords if kw.lower() in text_lower]
        if hits:
            scores[naics_code] = (len(hits), hits)
    if not scores:
        return None, 0, []
    best = max(scores, key=lambda c: scores[c][0])
    cnt, hits = scores[best]
    if cnt < threshold:
        return None, 0, []
    return best, cnt, hits


# ── Federal normalizer ────────────────────────────────────────────────────────
# Actual CKAN CSV column names (confirmed from bulk CSV headers):
#   owner_org_title        (not owner_org_title_en)
#   recipient_province     (not recipient_province_en)
#   agreement_start_date   (not proj_start_date)
#   agreement_end_date     (not proj_end_date)
#   naics_identifier       (not naics)
#   agreement_title_en/fr  (for project title)
#   fiscal_year is NOT a column — must be derived from agreement_start_date

FEDERAL_COLUMN_MAP = {
    "ref_number":              "source_ref",
    "amendment_number":        "source_amendment_num",
    # department, fiscal_year, province handled directly in normalize_federal()
    "agreement_type":          "agreement_type",
    "recipient_legal_name":    "recipient_name_raw",
    "recipient_business_number": "recipient_bn",
    "recipient_city":          "recipient_city",
    "recipient_postal_code":   "recipient_postal_code",
    "agreement_value":         "award_value",
    "agreement_start_date":    "start_date",
    "agreement_end_date":      "end_date",
    "naics_identifier":        "naics_code",
}


def normalize_federal(row) -> dict:
    out: dict = {f: None for f in CANONICAL_FIELDS}
    out["source"] = "federal"
    out["pipeline_version"] = PIPELINE_VERSION
    out["processed_at"] = datetime.utcnow().isoformat()

    # Bulk rename via column map
    for raw_col, canon_col in FEDERAL_COLUMN_MAP.items():
        val = row.get(raw_col)
        out[canon_col] = _s(val) if isinstance(val, (str, float, type(None))) else val

    # Department — single bilingual column (no _en suffix in real CSV)
    out["department"] = str(row.get("owner_org_title") or "").strip() or None

    # Fiscal year — derived from agreement_start_date (no fiscal_yr column in CSV)
    _start_raw = str(row.get("agreement_start_date") or "")
    if _start_raw:
        try:
            _yr = int(_start_raw[:4])
            _mo = int(_start_raw[5:7]) if len(_start_raw) >= 7 else 1
            _fy_start = _yr if _mo >= 4 else _yr - 1
            out["fiscal_year"] = normalize_fiscal_year(f"{_fy_start}-{str(_fy_start + 1)[2:]}")
        except (ValueError, IndexError):
            out["fiscal_year"] = None
    else:
        out["fiscal_year"] = None

    # Agreement type
    agtype = str(row.get("agreement_type") or "").strip().upper()
    out["agreement_type"] = {"G": "grant", "C": "contribution"}.get(agtype)

    # Recipient name
    raw_name = _s(out.get("recipient_name_raw"))
    if raw_name:
        out["recipient_name"] = raw_name.title() if raw_name.isupper() else raw_name

    # BN: strip non-digits, keep first 9
    bn_raw = re.sub(r"[^0-9]", "", str(row.get("recipient_business_number") or ""))
    out["recipient_bn"] = bn_raw[:9] if len(bn_raw) >= 9 else None

    # Province — single column (no _en suffix in real CSV)
    prov_raw = str(row.get("recipient_province") or "")
    out["recipient_province"] = normalize_province(prov_raw)

    out["recipient_city"] = normalize_city(_s(out.get("recipient_city")))
    out["recipient_postal_code"] = normalize_postal_code(_s(out.get("recipient_postal_code")))

    # Award value
    out["award_value"] = normalize_amount(out.get("award_value"))
    out["source_amendment_num"] = pd.to_numeric(out.get("source_amendment_num"), errors="coerce")

    # Dates
    for date_field in ("start_date", "end_date"):
        raw_date = _s(out.get(date_field))
        if raw_date:
            parsed = pd.to_datetime(raw_date, errors="coerce")
            out[date_field] = None if pd.isna(parsed) else parsed.isoformat()
        else:
            out[date_field] = None

    # Program name (bilingual columns exist in real CSV)
    prog, _ = resolve_bilingual(row, "prog_name_en", "prog_name_fr")
    out["program_name"] = prog

    purpose, _ = resolve_bilingual(row, "prog_purpose_en", "prog_purpose_fr")
    out["program_purpose"] = purpose

    # Description — combine title + description (bilingual)
    desc_en, _ = resolve_bilingual(row, "description_en", "description_fr")
    title_en, _ = resolve_bilingual(row, "agreement_title_en", "agreement_title_fr")
    full_text = " | ".join(p for p in [title_en, desc_en] if p)
    out["description"] = full_text or None

    # NAICS
    code, _, valid = clean_naics(_s(out.get("naics_code")))
    if valid:
        out["naics_code"], out["naics_inferred"] = code, False
    else:
        inferred, _, _ = infer_naics_from_text(out.get("description") or "")
        out["naics_code"] = inferred
        out["naics_inferred"] = bool(inferred)

    return out


# ── Alberta normalizer ────────────────────────────────────────────────────────

def normalize_alberta(row) -> dict:
    out: dict = {f: None for f in CANONICAL_FIELDS}
    out["source"] = "alberta"
    out["pipeline_version"] = PIPELINE_VERSION
    out["processed_at"] = datetime.utcnow().isoformat()

    raw_name = _s(row.get("RecipientName")) or ""
    raw_amount = _s(row.get("GrantAmount")) or ""
    raw_year = _s(row.get("FiscalYear")) or ""
    key = f"{raw_name}|{raw_amount}|{raw_year}"
    out["source_ref"] = "AB-" + hashlib.md5(key.encode()).hexdigest()[:12]
    out["source_amendment_num"] = 0
    out["agreement_type"] = "grant"
    out["recipient_province"] = "AB"

    out["department"] = _s(row.get("Ministry"))
    out["fiscal_year"] = normalize_fiscal_year(raw_year)
    out["recipient_name_raw"] = raw_name or None
    if raw_name:
        out["recipient_name"] = raw_name.title() if raw_name.isupper() else raw_name
    out["recipient_city"] = normalize_city(_s(row.get("Municipality")))
    out["program_name"] = _s(row.get("ProgramName"))
    out["program_purpose"] = _s(row.get("FundingSource"))
    out["award_value"] = normalize_amount(row.get("GrantAmount"))
    out["description"] = _s(row.get("Description"))

    inferred, _, _ = infer_naics_from_text(out.get("description") or "")
    out["naics_code"] = inferred
    out["naics_inferred"] = bool(inferred)

    return out
