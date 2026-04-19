# Grant Radar

Competitive grants intelligence for Canadian government data.

**Core question:** *"Who in my industry has been getting government grants — and how much?"*

Grant Radar ingests ~400K federal award records, runs a multi-stage processing pipeline (normalization → deduplication → entity resolution), and serves a Next.js dashboard with competitive intelligence views.

---

## Architecture

```
 DATA SOURCES                PIPELINE (offline)           DASHBOARD (live)
 ─────────────               ───────────────────          ─────────────────
 data/                       python -m pipeline run
   federal_grants_raw.csv ──► 1. Ingest (local CSV)
   (203 MB, ~402K rows)       2. Normalize (schema)  ──► data/processed/
                              3. Deduplicate               awards.parquet
 ised-isde.canada.ca ───────► 4. Entity resolution         programs.parquet
   (5 HTML program pages)     5. Consolidate               qa_report.json
                              6. Scrape programs             │
                              7. QA checks                   │
                                                             ▼
                                                    FastAPI  (port 8000)
                                                    Next.js  (port 3000)
```

**Key design choice:** the pipeline runs once offline and writes parquet. The dashboard is read-only — startup takes <1 second instead of minutes.

---

## Quick start (local dev)

### Prerequisites

- [uv](https://docs.astral.sh/uv/) — Python package manager
- Node.js 20+
- The raw CSV in `data/federal_grants_raw.csv` ([download here](https://open.canada.ca/data/dataset/432527ab-7aac-45b5-81d6-7597107a7013))

### 1. Install dependencies

```bash
make install
```

### 2. Run the pipeline (once)

```bash
make pipeline
```

This reads `data/federal_grants_raw.csv`, runs all processing steps, and writes the cache to `data/processed/`. Takes ~5–10 minutes for all 402K records.

Check what was processed:

```bash
make pipeline-info
```

### 3. Start the dev servers

```bash
make dev          # starts backend + frontend in parallel
```

Or individually:

```bash
make backend      # http://localhost:8000
make frontend     # http://localhost:3000
```

---

## Makefile reference

```
Setup
  make install              Install all backend + frontend dependencies

Pipeline  (run before starting the server)
  make pipeline             Process data/federal_grants_raw.csv → cache
  make pipeline-fetch       Re-download from CKAN API then process
  make pipeline-info        Show current cache status (age, record count)

Development
  make dev                  Start backend + frontend (parallel)
  make backend              Start backend only  (http://localhost:8000)
  make frontend             Start frontend only (http://localhost:3000)

Docker
  make docker-build         Build all images
  make docker-pipeline      Run pipeline inside Docker (writes to volume)
  make docker-up            Start full stack
  make docker-down          Stop containers

Maintenance
  make lint                 Lint backend (ruff) + frontend (eslint)
  make clean                Remove build artefacts
```

---

## Docker

```bash
# 1. Build images
make docker-build

# 2. Run pipeline (writes processed data to a named volume)
make docker-pipeline

# 3. Start the stack
make docker-up
```

Services start at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/health

The pipeline and API share a Docker volume (`pipeline_cache`) so the cache persists across restarts. To refresh data, re-run `make docker-pipeline`.

---

## Pipeline stages

| Step | Module | What it does |
|------|--------|-------------|
| 1 | `ingestion.py` | Load local CSV (or fetch from CKAN DataStore with `--fetch`; falls back to bulk CSV if DataStore is empty) |
| 2 | `normalization.py` | Map raw columns to canonical schema; clean amounts, provinces, postal codes, BNs; derive fiscal year from `agreement_start_date` |
| 3 | `deduplication.py` | Exact dedup on `(source, ref_number, amendment_number)`; cross-source fuzzy dedup within province+fiscal_year blocks |
| 4 | `consolidation.py` | Keep latest amendment per award; run QA checks (negative values, implausible amounts, missing recipients) |
| 5 | `entity_resolution.py` | BN exact match → vectorised fuzzy match within (province, name-prefix) blocks using `rapidfuzz.process.cdist` → singletons |
| 6 | `programs_scraper.py` | Fetch 5 ISED HTML program pages; extract eligibility, funding range, NAICS codes via regex + keyword rules (no LLM) |
| 7 | `cache.py` | Write `awards.parquet`, `programs.parquet`, `qa_report.json` to `data/processed/` |

### Entity resolution performance

The fuzzy matching uses two-level blocking:
- **Primary block:** `recipient_province` — 13 groups
- **Secondary block:** first character of normalised name — ~26 sub-groups

Combined with `process.cdist()` (C-accelerated vectorised scoring), this is ~200× faster than naive O(n²) Python loops. On 10K records, Tier 2 resolves in ~2 seconds.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status, record count, cache metadata |
| GET | `/api/stats` | Overview stats (total funding, recipients, year range) |
| GET | `/api/naics-sectors` | NAICS 2-digit sectors present in the data |
| GET | `/api/competitor-map` | Top recipients by NAICS + province |
| GET | `/api/funding-trend` | Year-over-year funding by NAICS |
| GET | `/api/program-intelligence` | Top programs by total disbursed for a NAICS |
| GET | `/api/top-recipients` | Top recipients across all NAICS (no filter required) |
| GET | `/api/programs` | Scraped program metadata (eligibility, funding caps, status) |
| GET | `/api/sector-heatmap` | Funding matrix: sector × province |
| GET | `/api/qa-report` | QA check results from last pipeline run |

---

## Project structure

```
grant_radar/
├── Makefile                         make install / pipeline / dev / docker-*
├── docker-compose.yml               pipeline + backend + frontend services
├── .env.example                     environment variable reference
│
├── data/                            gitignored — create before first run
│   ├── federal_grants_raw.csv       raw CKAN download (203 MB, ~402K rows)
│   └── processed/                   pipeline output (written by make pipeline)
│       ├── awards.parquet
│       ├── programs.parquet
│       ├── qa_report.json
│       └── meta.json
│
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── app/
│   │   └── main.py                  FastAPI app — loads parquet, serves API
│   └── pipeline/
│       ├── __main__.py              CLI:  python -m pipeline run / info
│       ├── cache.py                 save() / load() parquet helpers
│       ├── ingestion.py             CKAN DataStore + bulk CSV fallback
│       ├── normalization.py         per-source canonical schema mapping
│       ├── deduplication.py         exact + cross-source dedup
│       ├── consolidation.py         amendment consolidation + QA rules
│       ├── entity_resolution.py     BN → fuzzy (cdist) → singleton
│       ├── intelligence.py          competitor_map, funding_trend, etc.
│       ├── programs_scraper.py      HTML scraper → structured program records
│       └── constants.py             NAICS sectors, province map, CKAN URLs
│
├── frontend/
│   ├── package.json
│   ├── Dockerfile
│   ├── next.config.ts               /api/* rewrites → backend
│   ├── lib/api.ts                   typed fetch client
│   └── app/
│       ├── page.tsx                 Overview / stats
│       ├── radar/                   Competitive radar
│       ├── programs/                Program intelligence + directory
│       └── ...
│
└── pipeline_exploration.ipynb       End-to-end methodology notebook
```

---

## Data sources

| Source | Access | Coverage |
|--------|--------|----------|
| [Federal Open Canada](https://open.canada.ca/data/en/dataset/432527ab-7aac-45b5-81d6-7597107a7013) | CKAN API + bulk CSV (no key needed) | All federal departments, FY 2005–present |
| [ISED program pages](https://ised-isde.canada.ca) | Public HTML (scraped) | SIF, CSBFP, AGS, ISC, CTI |

All data is published under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

---

## Notebook

`pipeline_exploration.ipynb` walks through the full pipeline methodology end-to-end — ingestion, normalization, entity resolution, the unstructured HTML pipeline, and the intelligence layer. Run it with:

```bash
uv run jupyter lab pipeline_exploration.ipynb
```

The notebook uses `data/federal_grants_raw.csv` directly (same file as the backend pipeline) so all methodology is grounded in real data.

---

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `GRANT_RADAR_CACHE_DIR` | `data/processed/` | Where the pipeline writes and the API reads its parquet cache |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origins the backend accepts |
| `NEXT_PUBLIC_API_URL` | *(empty)* | Backend base URL; leave empty to use Next.js `/api/*` rewrites |
