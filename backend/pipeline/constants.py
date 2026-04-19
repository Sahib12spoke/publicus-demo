"""Shared lookup tables used across the pipeline."""

NAICS_SECTORS: dict[str, str] = {
    "11": "Agriculture, Forestry & Fishing",
    "21": "Mining, Oil & Gas",
    "22": "Utilities",
    "23": "Construction",
    "31": "Manufacturing",
    "32": "Manufacturing",
    "33": "Manufacturing",
    "41": "Wholesale Trade",
    "44": "Retail Trade",
    "45": "Retail Trade",
    "48": "Transportation & Warehousing",
    "49": "Transportation & Warehousing",
    "51": "Information & Cultural Industries",
    "52": "Finance & Insurance",
    "53": "Real Estate",
    "54": "Professional & Technical Services",
    "55": "Management of Companies",
    "56": "Administrative & Support Services",
    "61": "Educational Services",
    "62": "Health Care & Social Assistance",
    "71": "Arts, Entertainment & Recreation",
    "72": "Accommodation & Food Services",
    "81": "Other Services",
    "91": "Public Administration",
}

NAICS_KEYWORD_RULES: dict[str, list[str]] = {
    "541511": ["software", "custom software", "application development", "web app",
               "mobile app", "saas", "api", "platform development"],
    "541512": ["it consulting", "systems integration", "cloud", "infrastructure",
               "managed services", "digital transformation"],
    "541519": ["cybersecurity", "information security", "data security",
               "vulnerability", "penetration testing", "zero trust"],
    "541330": ["engineering", "civil engineering", "structural", "mechanical",
               "electrical engineering", "environmental assessment"],
    "541610": ["management consulting", "strategy", "organizational",
               "business transformation", "change management"],
    "518210": ["data processing", "cloud computing", "data centre", "hosting",
               "machine learning", "artificial intelligence", " ai "],
    "721110": ["research", "r&d", "innovation", "prototype", "laboratory"],
    "621111": ["healthcare", "clinical", "patient", "hospital", "medical device"],
    "611310": ["university", "college", "training", "workforce development"],
}

PROVINCE_MAP: dict[str, str] = {
    "Alberta": "AB", "British Columbia": "BC", "Manitoba": "MB",
    "New Brunswick": "NB", "Newfoundland and Labrador": "NL",
    "Northwest Territories": "NT", "Nova Scotia": "NS", "Nunavut": "NU",
    "Ontario": "ON", "Prince Edward Island": "PE", "Quebec": "QC",
    "Saskatchewan": "SK", "Yukon": "YT",
    "Colombie-Britannique": "BC", "Québec": "QC", "Île-du-Prince-Édouard": "PE",
    "Terre-Neuve-et-Labrador": "NL", "Territoires du Nord-Ouest": "NT",
    "Nouvelle-Écosse": "NS", "Nouveau-Brunswick": "NB",
    "BC": "BC", "AB": "AB", "ON": "ON", "QC": "QC", "NS": "NS",
    "NB": "NB", "MB": "MB", "SK": "SK", "PE": "PE", "NL": "NL",
    "NT": "NT", "YT": "YT", "NU": "NU",
    "Newfoundland": "NL", "P.E.I.": "PE", "PEI": "PE",
    "Ont.": "ON", "Que.": "QC", "B.C.": "BC",
}

CANONICAL_FIELDS = [
    "source", "source_ref", "source_amendment_num", "department",
    "fiscal_year", "agreement_type", "recipient_name_raw", "recipient_name",
    "recipient_bn", "recipient_province", "recipient_city", "recipient_postal_code",
    "program_name", "program_purpose", "award_value", "start_date", "end_date",
    "naics_code", "naics_inferred", "description", "entity_id",
    "pipeline_version", "processed_at",
]

PIPELINE_VERSION = "0.2.0"

CKAN_BASE = "https://open.canada.ca/data/en/api/3/action"
GRANTS_PACKAGE_ID = "432527ab-7aac-45b5-81d6-7597107a7013"
