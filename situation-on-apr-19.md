# Situation — 2026-04-19

Branch `feature/radar-eligibility-quality` vs `CURRENT_SCENARIO_NEXT_PLAN.md`.
5 commits on top of initial. Diff: 9 files, +655 / −30.

---

## How to run (dev)

Requires: `uv`, Node/npm. One-time: `make install`.

1. **Build pipeline cache (once):** `make pipeline`
   (or skip HTML scraper: `make pipeline-skip-scraper`)
2. **Start both servers:** `make dev`
   Backend → http://localhost:8000 · Frontend → http://localhost:3000

Run individually: `make backend` · `make frontend`
Docker path: `make docker-build && make docker-pipeline && make docker-up`

---

## Phase 1 — Bug fixes (1 / 8 done)

| # | File | Status |
|---|---|---|
| 1A | `backend/pipeline/consolidation.py:27` QA rule | **Not done** — still `fillna(0) <= 0` |
| 1B | `backend/pipeline/intelligence.py` `<$1K` tier (L47/115/118/191) | **Not done** |
| 1C | `backend/pipeline/entity_resolution.py:129-131` singleton hash | **Not done** — still hashes `idx` |
| 1D | `backend/pipeline/programs_scraper.py:217` regional province scope | **Not done** |
| 1E | `frontend/app/globals.css` `--success-muted`, `--surface-alt` | **Not done** |
| 1F | `frontend/app/page.tsx` duplicate link + Alberta status | **Done** |
| 1G | `frontend/app/layout.tsx:33` footer `open.alberta.ca` | **Not done** |
| 1H | `frontend/lib/charts.tsx` heatmap light-mode | **Not done** |

### Bug classification

**Flow-breakers (fix before demo):**
- **1C** — singleton hash non-deterministic → same recipient gets different entity IDs, fragmenting the new **Recipient Profile** page.
- **1A** — QA rule flags every missing `award_value` as error → `/quality` page shows inflated error count, contradicting the data-quality pitch.
- **1B** — "$0K" strings leak into Competitor Map, Top Recipients, Program Intelligence.
- **1E** — Programs page unreadable in light theme (missing CSS vars).

**Good-to-have (safe to skip):**
- **1D** — current scraper URLs all resolve to "ALL" correctly anyway.
- **1G** — cosmetic footer text.
- **1H** — dark mode is the default.

After fixing 1A + 1C, re-run `make pipeline` (they change parquet output).

## Phase 2 — Pipeline Transparency (partial)

- **2A** `/api/pipeline-stats` endpoint — **Not done**. `main.py` instead added `/api/recipient/{entity_id}`.
- **2B** `api.ts` `PipelineStats` types/method — **Not done**. Only `recipient` / `RecipientProfile` added.
- **2C** `/quality` page — **Partial**. Renders status bar, QA table, static 7-stage descriptions. Missing: entity-resolution tier bars, field-completeness bars, province/year/NAICS coverage, pipeline version & last-processed timestamp.
- **2D** `nav.tsx` quality link — **Done**.

## Phase 3 — UI

- **3A** Hero rewrite ("Your competitors are grant-funded. Are you?") — **Done**.
- **3B** Pipeline callout — **Done via feature card** (no separate callout section).

## Phase 4 — Writeup

- `writeup.md` — **Missing**.

## Phase 5 — Deploy + Test

- Nothing in this branch (no Railway/Vercel config, no test evidence).

---

## Extras shipped (beyond the plan)

- `/api/recipient/{entity_id}` endpoint + `frontend/app/recipient/[entity_id]/page.tsx` (sector mix, yearly funding, top programs, award list).
- Eligibility tab on `/radar` (4th tab, fed from existing programs data).
- `FlipStatBox` component + NAICS-coverage flip card on home.
- Homepage reframed for procurement-intelligence positioning.

---

## Pending priority (to land the plan)

1. Backend bugs **1A–1D** — correctness blockers; re-run `make pipeline` after.
2. `/api/pipeline-stats` + fill out `/quality` page (2A/2B/2C gaps) — #1 evaluation criterion.
3. `writeup.md`.
4. Deploy (Railway/Vercel).
5. Frontend cleanup **1E, 1G, 1H**.
