# Grant Radar: Current Scenario & Implementation Plan

## Objective

Make Grant Radar a **demo-ready, deployed prototype** for the Publicus technical assessment by April 20, 2026. The employer evaluates: data pipeline quality (#1), problem understanding, business outcomes, creativity, execution, and strategic thinking. The recruiter's tip: *"Focus on outcomes not output. Approach with what problem you are solving, not what the solution does."*

---

## Current Scenario

### What Exists (Complete Codebase at `grant_radar_all/grant_radar`)

**Backend Pipeline (7 stages, all implemented):**
- `ingestion.py` — CKAN API + bulk CSV fallback
- `normalization.py` — Field cleaning, bilingual EN/FR resolution, NAICS keyword inference
- `deduplication.py` — Exact dedup + cross-source fuzzy dedup within province/FY blocks
- `consolidation.py` — Amendment grouping + 4 QA rules
- `entity_resolution.py` — 3-tier: BN exact match -> rapidfuzz vectorized fuzzy (province x name-prefix blocking) -> singletons
- `programs_scraper.py` — Scrapes 5 ISED HTML pages, extracts eligibility/funding/NAICS via regex
- `cache.py` — Writes awards.parquet, programs.parquet, qa_report.json

**FastAPI Backend (`backend/app/main.py`):**
- 10 API endpoints: health, stats, naics-sectors, competitor-map, funding-trend, program-intelligence, top-recipients, programs, sector-heatmap, qa-report

**Next.js Frontend (4 pages):**
- Home — Stats, feature cards, data sources
- Competitive Radar — NAICS sector search, competitor table, funding trend chart, programs table
- Sector Funding Map — Sector x province heatmap
- Program Intelligence — Award-based programs + program directory
- Plus: API client (`lib/api.ts`), charts (`lib/charts.tsx`), dark/light theme, polished CSS

**Data:**
- Raw: `data/federal_grants_raw.csv` (213 MB, ~402K records)
- Processed: `data/processed/awards.parquet`, `programs.parquet`, `qa_report.json`, `meta.json`

**Infra:**
- Makefile, docker-compose.yml, Dockerfiles for backend + frontend, .env.example

### What's Wrong (Bugs Found)

**Backend Bugs:**
1. **consolidation.py line 27** — QA rule `negative_award` uses `fillna(0) <= 0`, flagging ALL missing award values as errors. Inflates error count in QA report.
2. **intelligence.py lines 47, 115, 118, 191** — Currency formatting breaks for amounts < $1K. Shows "$0K" instead of actual value.
3. **entity_resolution.py lines 129-131** — Singleton hash includes DataFrame row index. Same recipient in different rows gets different entity_ids.
4. **programs_scraper.py line 217** — Province scope is always "ALL" except BC. Doesn't handle regional agency URLs.

**Frontend Bugs:**
5. **globals.css** — Missing CSS variables `--success-muted` and `--surface-alt`. Programs page is unreadable in light theme.
6. **page.tsx line 65** — "Funding Trends" feature card links to `/radar` (duplicate of Competitive Radar).
7. **page.tsx line 107** — Alberta data source shown as "active" but we only use federal data.
8. **layout.tsx footer** — References "open.alberta.ca" but we don't use Alberta data.
9. **charts.tsx heatColor()** — Uses white rgba, invisible on light backgrounds.

### What's Missing

- **Pipeline Transparency page** — All pipeline work (the #1 evaluation criterion) is completely invisible to users
- **Writeup document** — Assessment requires a 1-2 page deliverable
- **Deployment** — Must be hosted (Railway/Vercel) for employer access
- **End-to-end testing** — Never tested locally

---

## Implementation Plan

### Phase 1: Bug Fixes (~40 min)

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1A | `backend/pipeline/consolidation.py:27` | `fillna(0) <= 0` flags missing values as errors | Change to `df["award_value"].notna() & (df["award_value"] <= 0)` |
| 1B | `backend/pipeline/intelligence.py:47,115,118,191` | "$0K" for amounts < $1K | Add third tier: `f"${v:,.0f}"` when `v < 1e3` |
| 1C | `backend/pipeline/entity_resolution.py:129-131` | Singleton hash includes row index | Hash on `(recipient_name, recipient_province)` only |
| 1D | `backend/pipeline/programs_scraper.py:217` | Province scope always "ALL" | Add regional agency URL matching (ACOA, WD, CanNor, FedDev, etc.) |
| 1E | `frontend/app/globals.css` | Missing `--success-muted`, `--surface-alt` | Add to both `:root` and `[data-theme="light"]` |
| 1F | `frontend/app/page.tsx:65,107` | Duplicate link + Alberta "active" | Replace card with Pipeline Quality link; change Alberta to "planned" |
| 1G | `frontend/app/layout.tsx:33` | Footer references Alberta | Remove "open.alberta.ca" |
| 1H | `frontend/lib/charts.tsx` | Heatmap invisible in light mode | Use blue gradient that works on both themes |

**After fixes:** Re-run pipeline (`python -m pipeline run --skip-programs`) to regenerate parquet with corrected data.

---

### Phase 2: Pipeline Transparency Page (~90 min) — HIGHEST IMPACT

**Why this matters most:** The employer says data pipeline quality is "the most important part" of evaluation. Currently all pipeline work is invisible. This page makes it the star feature. No competitor offers pipeline transparency.

#### 2A. New backend endpoint: `/api/pipeline-stats`
**File:** `backend/app/main.py`
**Returns:**
- Entity resolution tier breakdown (BN match count, fuzzy match count, singleton count, review-flagged count)
- Data completeness per field (% non-null for each column)
- Province coverage (records, funding, unique recipients per province)
- Year coverage (records, funding per fiscal year)
- NAICS coverage (filled vs inferred vs missing)
- Pipeline metadata (version, processed date, record counts)

#### 2B. Frontend API types + method
**File:** `frontend/lib/api.ts`
- Add `PipelineStats` TypeScript interface
- Add `api.pipelineStats()` method

#### 2C. New page: `/quality`
**File:** `frontend/app/quality/page.tsx` (NEW)
**Layout:**
1. **Pipeline Overview** — Stat boxes: Total Records, Unique Entities, Pipeline Version, Last Processed
2. **Entity Resolution** — Stacked horizontal bars showing tier breakdown with percentages
3. **QA Report** — Table with severity badges (error/warning/info) from qa_report.json
4. **Field Completeness** — Horizontal bar chart showing % filled for each field
5. **Pipeline Stages** — Brief explanation of each of the 7 stages and what they do

#### 2D. Add to navigation
**File:** `frontend/app/nav.tsx` — Add "quality" link to LINKS array

---

### Phase 3: UI Improvements (~30 min)

#### 3A. Home page hero — Lead with the problem
**File:** `frontend/app/page.tsx`
- **Current:** "Who's getting funded in your space?" (a question)
- **Better:** "Your competitors are grant-funded. Are you?" — frames the competitive disadvantage problem
- Add a pipeline transparency callout section with link to `/quality`

#### 3B. Home page — Add pipeline callout card
Brief section explaining the 7-stage pipeline with link to quality page. Shows the employer we're proud of the data work.

---

### Phase 4: Writeup (~45 min)

**File:** `writeup.md` (NEW, project root)

**Required sections per assessment brief:**

1. **The Problem & Who It's For**
   - B2G companies (IT consulting, engineering, cybersecurity) lack visibility into competitor grant funding
   - A competitor who gets a $1M IRAP grant to develop a product shows up at the next RFP with a subsidized, tested solution
   - The data exists (402K records in Open Canada) but is raw, unnormalized, and impossible to query competitively

2. **How This Creates Value for Publicus**
   - **Lead generation:** Free competitive intelligence tool attracts B2G businesses who discover Publicus's procurement product
   - **Market positioning:** No platform combines procurement + grants intelligence — this is a new category
   - **Usage & retention:** Existing procurement customers get a reason to come back (grants intelligence complements RFP tracking)
   - **Revenue expansion:** Grants intelligence justifies a premium tier or upsell

3. **Data Acquisition & Cleaning Approach**
   - Federal CKAN API as primary source with bulk CSV fallback
   - 7-stage pipeline: ingest -> normalize -> deduplicate -> consolidate amendments -> entity resolution -> NAICS classification -> QA
   - Bilingual field resolution (EN/FR), province normalization, currency cleaning
   - Entity resolution: 3-tier approach with two-level blocking (province x name-prefix) for ~200x speedup
   - QA rules: negative values, implausible amounts (>$500M), missing recipients, missing values

4. **Key Decisions & Why**
   - Offline pipeline + parquet cache: dashboard loads in <1s, pipeline runs separately
   - Two-level blocking in entity resolution: reduces O(n^2) to manageable blocks while maintaining recall
   - No LLM in pipeline: deterministic, reproducible, fast, no API cost
   - Pipeline transparency page: makes the hardest work visible to evaluators
   - Competitive intelligence framing (not "another grants search"): differentiation from Fundica, helloDarwin, GrantMatch

5. **What I'd Do Next**
   - Alberta provincial data integration (structured, API-accessible)
   - Cross-reference with Publicus procurement vendor data (entity resolution across both)
   - ML-powered NAICS classification (BERT zero-shot) for the ~79% of records without NAICS codes
   - Recipient profile pages (deep-dive into a single entity's grant history)
   - Temporal analysis: grants-to-procurement pipeline intelligence (grants precede RFPs)
   - Grant stacking guidance (75% stacking limit awareness)

---

### Phase 5: Deploy + Test (~45 min)

#### 5A. End-to-end local test
1. Re-run pipeline: `cd backend && python -m pipeline run --skip-programs`
2. Start backend: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000`
3. Start frontend: `cd frontend && npm run dev`
4. Test all 5 pages in dark + light themes
5. Test API: `/api/health`, `/api/stats`, `/api/qa-report`, `/api/pipeline-stats`

#### 5B. Deploy to Railway
- Include pre-processed parquet in backend Docker image (COPY data/processed into image)
- Deploy backend + frontend as two Railway services
- Set env vars: `CORS_ORIGINS=https://<frontend-url>`, `NEXT_PUBLIC_API_URL=https://<backend-url>`
- Alternative: Frontend on Vercel (free, optimized for Next.js) + Backend on Railway

#### 5C. Fallback
- If deployment has issues: demo locally via screen share. Have `make dev` ready.

---

## Priority Order (If Time Gets Short)

**Must do (non-negotiable):**
1. Bug fixes (Phase 1) — correctness
2. Pipeline Transparency page (Phase 2) — highest demo impact
3. End-to-end test (Phase 5A) — must work
4. Deploy (Phase 5B) — required by assessment

**Should do:**
5. Writeup (Phase 4) — required deliverable
6. Hero copy rewrite (Phase 3A) — strategic framing

**Nice to have:**
7. Heatmap light-mode fix (Phase 1H) — dark mode is default
8. Province scope enhancement (Phase 1D) — existing URLs all map to "ALL" correctly anyway

---

## Files to Modify

| File | Changes |
|------|---------|
| `backend/pipeline/consolidation.py` | Fix QA rule |
| `backend/pipeline/intelligence.py` | Fix currency format (4 locations) |
| `backend/pipeline/entity_resolution.py` | Fix singleton hash |
| `backend/pipeline/programs_scraper.py` | Enhance province scope |
| `backend/app/main.py` | Add `/api/pipeline-stats` endpoint |
| `frontend/app/globals.css` | Add missing CSS variables |
| `frontend/app/page.tsx` | Fix card link, Alberta status, hero copy, pipeline callout |
| `frontend/app/layout.tsx` | Fix footer |
| `frontend/app/nav.tsx` | Add quality link |
| `frontend/lib/api.ts` | Add PipelineStats types + method |
| `frontend/lib/charts.tsx` | Fix heatmap colors |
| **NEW:** `frontend/app/quality/page.tsx` | Pipeline transparency page |
| **NEW:** `writeup.md` | Assessment deliverable |
