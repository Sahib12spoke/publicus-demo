# Grant Radar — Writeup

**Thesis:** Canadian government grants are a leading indicator for federal RFPs 12–18 months out. Entity resolution across grants and procurement is the moat. Publicus already knows every RFP. Grant Radar is what lets Publicus also know who's about to win.

---

## 1. Problem & audience

**Who this is for:** BD and sales leaders at Canadian B2G firms that bid on federal RFPs — IT consulting, cybersecurity, engineering, management consulting. The Ottawa mid-market crowd already in Publicus's ICP.

**The problem they have:** They see the RFP when it drops. By then the eventual winner was funded 12–18 months earlier through an IRAP, SIF, AGS, ISC, or CIIP grant to build the exact capability the RFP is asking for. Every bid is a fight against a subsidized, battle-tested incumbent they never saw coming. Customer testimonials cited in Publicus's own marketing say users discovered they'd been "missing 40% of relevant opportunities" — the upstream signal is even less visible.

**Concrete pattern (illustrative):** Department X issues a 2024 RFP for managed cybersecurity services. The winner had three ISC Phase 1/2 grants totalling ~$2M in 2021–2022 to build an MDR platform. That grant history was public the whole time and nobody was looking.

**Who this is NOT for:** Charities and nonprofits (GrantConnect, helloDarwin already serve them). Individual grant *applicants* looking for how-to-apply help (no application workflow here). Users outside Canada. Real-time deal-flow users — this is a strategic/directional view, not a live alerting tool.

**Where it sits vs. existing tools:** MERX and Biddingo list tenders but have zero AI and no grants view. Fundica and helloDarwin list grants but have zero procurement connection. BidPrime is US-first. **No one in Canada fuses the two.** That's the wedge.

---

## 2. Business value to Publicus

Three levers, in order of leverage:

**(a) Lead-gen wedge.** A free public radar is a top-of-funnel acquisition surface that screams "we understand B2G." Same personas as the existing vendor product, same ICP, zero incremental sales motion. Every BD lead who searches "who got cybersecurity grants Ontario" is a Publicus MQL.

**(b) Entity-resolution moat.** The grants dataset has 221K recipient records with Business Numbers where populated plus names/provinces where not. Procurement (which Publicus already has) has the vendor side. Resolving entities across both is the hard part and the thing competitors can't replicate by scraping the same public data. That cross-walked entity graph makes Publicus's *core* product smarter — not just the grants product. It's the foundation for "grants → pre-RFP signal" alerting, competitor capability profiles, and vendor-risk views for government buyers.

**(c) Structural tailwind.** The **Buy Canadian Policy** (effective Dec 2025) now applies to "all Government of Canada grants and contributions programs" as well as procurement. Buyers and sellers suddenly need a unified grants + procurement view by policy mandate. Whoever gets there first wins the category.

**Pricing surface this unlocks:** grants intelligence as an upsell tier on the existing vendor product; government-side spend transparency (who did we already fund for this capability?) for procurement officers at $15–25K pilots; a B2B API for banks and accelerators to enrich their Canadian SMB portfolios.

---

## 3. Data approach

**Source.** Treasury Board Proactive Disclosure of Grants & Contributions on Open Canada. CKAN API + bulk CSV, free commercial reuse under the Open Government Licence. 32 canonical fields, FY 2005–present, quarterly updates. Raw: ~402K rows; after consolidation: 221K awards. Plus 5 ISED program pages scraped for eligibility + funding ranges.

**Pipeline (7 stages, offline batch, writes parquet):**

1. **Ingestion** — CKAN DataStore with bulk CSV fallback.
2. **Normalization** — 32-field canonical schema; amount/province/postal/BN cleanup; fiscal year derived from agreement start date; bilingual EN/FR handling.
3. **Deduplication** — exact dedup on `(source, ref_number, amendment_number)`, then fuzzy cross-source dedup within province × fiscal-year blocks.
4. **Consolidation** — keep the latest amendment per award; ~402K → ~221K.
5. **Entity resolution** — the core IP. Three tiers: (i) Business Number exact match, (ii) blocked fuzzy match using `rapidfuzz.process.cdist` with province × name-prefix blocking (~200× faster than naive O(n²) — 10K records resolve in ~2 sec), (iii) singletons.
6. **Program scraping** — ISED HTML → structured program records (eligibility, funding range, NAICS, status). Regex + keyword rules, no LLM in the hot path.
7. **QA** — 4 automated checks: negative values, implausible amounts (>$500M), missing recipients, missing award values. Surfaced on `/quality`.

**Design choices that matter:**

- **Offline parquet cache, not a live DB.** Data is quarterly. Startup is <1s instead of minutes. API is read-only.
- **Deterministic pipeline; LLM as optional batch enrichment only.** Keeps the main path reproducible and debuggable.
- **Honest NAICS handling.** Only 4.8% of records have a NAICS code after keyword inference — Treasury Board doesn't require it. The `/quality` page shows this number with context, the inference layer, and the planned LLM enrichment (NAICS2 target of 40–50% via batched classification on `recipient_name + program + description`). We refused to either hide the gap or over-claim what LLMs reliably deliver at 6-digit granularity.

---

## 4. Key decisions & next steps

**Decisions (and why):**

- **Quarterly batch, not real-time.** Grants are disclosed quarterly by Treasury Board. Real-time would be engineering theatre — the signal is directional (who's building capability), not tactical (bid today). Real-time belongs on the procurement side, which Publicus already has.
- **Entity resolution tier order: BN → fuzzy → singleton.** BN is deterministic where populated; fuzzy covers the long tail; singletons keep unmatched records visible rather than dropped. Blocking on province × name-prefix keeps runtime tractable.
- **NAICS2 target, not NAICS 6-digit.** 24 sectors vs. 20K codes. LLMs are reliable at NAICS2 on `recipient_name + program + description`; they're not at 6-digit. Shipping the honest version of what works beats a worse version of what sounds better.
- **No LLM in the hot path.** A bad LLM batch shouldn't degrade the rest of the dashboard. NAICS enrichment writes a separate parquet artifact with provenance (`original` / `keyword` / `llm`) that can be surfaced or ignored independently.
- **Radar stays on the classified subset.** Rather than inflate coverage with low-confidence guesses, Radar filters to records that *have* a NAICS code. Honest rankings over flattering ones.

**Next steps, ordered by leverage:**

1. **Procurement cross-reference.** Resolve entities across Grant Radar and Publicus's procurement vendor table. This is the moat. First concrete feature: a "Procurement crossover" card on every recipient page showing grants received → RFPs won/bid-on.
2. **LLM NAICS2 enrichment** (~2 hrs, budget-capped). Batch classify the unclassified subset. Layered provenance. Spot-check before flipping Radar queries to the enriched column.
3. **Pre-RFP alerting.** Automate the "grant cluster → likely RFP 12–18 months later" pattern. When a competitor in the customer's NAICS + province receives a new grant, email them.
4. **Alberta + Montreal provincial sources.** The only two cleanly structured non-federal sources. Adds coverage without opening the Pandora's box of Ontario/BC/Quebec HTML scraping.
5. **Consulting-firm grants (SR&ED, IRAP, wage subsidies).** Publicus's ICP overlooks these because most grant platforms target manufacturing/R&D. Surfacing them in context makes the product sticky.
6. **Entity-graph as internal service.** Once the cross-walk is working, expose it as an internal API the procurement product can call. That's when grants intelligence stops being a feature and starts being infrastructure.

---

**One-line close:** Publicus shows the race. Grant Radar shows the starting line. Together, they're the only view of the Canadian B2G market that tells you who's going to win before the RFP drops.
