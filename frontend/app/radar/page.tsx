"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, NaicsSector, CompetitorRow, TrendRow, ProgramRow, ProgramMetadata } from "@/lib/api";
import { TrendChart } from "@/lib/charts";

const PROVINCES = [
  { code: "", label: "All provinces" },
  { code: "AB", label: "Alberta" },
  { code: "BC", label: "British Columbia" },
  { code: "MB", label: "Manitoba" },
  { code: "NB", label: "New Brunswick" },
  { code: "NL", label: "Newfoundland" },
  { code: "NS", label: "Nova Scotia" },
  { code: "NT", label: "Northwest Territories" },
  { code: "NU", label: "Nunavut" },
  { code: "ON", label: "Ontario" },
  { code: "PE", label: "PEI" },
  { code: "QC", label: "Quebec" },
  { code: "SK", label: "Saskatchewan" },
  { code: "YT", label: "Yukon" },
];

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function RadarPage() {
  const [sectors, setSectors] = useState<NaicsSector[]>([]);
  const [naics, setNaics] = useState("");
  const [province, setProvince] = useState("");
  const [topN, setTopN] = useState(25);

  const [competitors, setCompetitors] = useState<CompetitorRow[] | null>(null);
  const [trend, setTrend] = useState<TrendRow[] | null>(null);
  const [programs, setPrograms] = useState<ProgramRow[] | null>(null);
  const [eligibility, setEligibility] = useState<ProgramMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"competitors" | "trend" | "programs" | "eligibility">("competitors");

  useEffect(() => {
    api.naicsSectors().then(setSectors).catch(() => {});
  }, []);

  const runQuery = useCallback(async () => {
    if (!naics) return;
    setLoading(true);
    setError(null);
    try {
      const [c, t, p, allProgs] = await Promise.all([
        api.competitorMap(naics, province || undefined, topN),
        api.fundingTrend(naics, province || undefined),
        api.programIntelligence(naics, 10),
        api.programs(),
      ]);
      setCompetitors(c);
      setTrend(t);
      setPrograms(p);
      const prefix = naics.slice(0, 2);
      setEligibility(allProgs.filter(p =>
        p.naics_codes.length === 0 || p.naics_codes.some(c => c.startsWith(prefix))
      ));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }, [naics, province, topN]);

  return (
    <>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div style={{ flex: "1 1 280px" }}>
          <div className="card">
            <div className="card-title">Competitive Radar</div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Enter your industry code and province to see who is receiving grants in your space.
            </p>

            <label className="filter-label">NAICS Sector</label>
            <select
              className="filter-select"
              value={naics}
              onChange={e => setNaics(e.target.value)}
            >
              <option value="">— select sector —</option>
              {sectors.map(s => (
                <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
              ))}
            </select>

            <label className="filter-label" style={{ marginTop: "0.75rem" }}>Province</label>
            <select
              className="filter-select"
              value={province}
              onChange={e => setProvince(e.target.value)}
            >
              {PROVINCES.map(p => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>

            <label className="filter-label" style={{ marginTop: "0.75rem" }}>Top N recipients</label>
            <select
              className="filter-select"
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <button
              className="btn"
              style={{ marginTop: "1rem", width: "100%" }}
              onClick={runQuery}
              disabled={!naics || loading}
            >
              {loading ? "Loading…" : "Run Radar →"}
            </button>

            {error && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--danger)" }}>
                {error}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: "3 1 500px", minWidth: 0 }}>
          {!competitors && !loading && (
            <div className="empty">
              Select a NAICS sector and run the radar to see results.
            </div>
          )}

          {loading && <div className="loading">Loading…</div>}

          {competitors && !loading && (
            <>
              <div className="tab-bar" style={{ marginBottom: "1rem" }}>
                {(["competitors", "trend", "programs", "eligibility"] as const).map(t => (
                  <button
                    key={t}
                    className={`tab${tab === t ? " active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "competitors" ? `Competitors (${competitors.length})` :
                     t === "trend" ? "Funding Trend" :
                     t === "programs" ? "Programs" :
                     <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                       Eligibility
                       {eligibility.length > 0 && (
                         <span style={{ background: "var(--success)", color: "#000", borderRadius: 2, padding: "0 4px", fontSize: "0.65rem", fontWeight: 700 }}>
                           {eligibility.length}
                         </span>
                       )}
                     </span>}
                  </button>
                ))}
              </div>

              {tab === "competitors" && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {competitors.length === 0 ? (
                    <div className="empty">No recipients found for this sector/province.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Organization</th>
                          <th>Province</th>
                          <th style={{ textAlign: "right" }}>Total Funding</th>
                          <th style={{ textAlign: "right" }}>Grants</th>
                          <th>Latest</th>
                          <th>Programs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {competitors.map(r => (
                          <tr key={r.entity_id}>
                            <td style={{ color: "var(--text-muted)" }}>{r.rank}</td>
                            <td style={{ fontWeight: 500 }}>
                              <Link href={`/recipient/${r.entity_id}`} style={{ color: "var(--accent)" }}>
                                {r.recipient_name}
                              </Link>
                            </td>
                            <td><span className="badge badge-neutral">{r.province}</span></td>
                            <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 600 }}>
                              {r.total_funding_fmt}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{r.grant_count}</td>
                            <td style={{ color: "var(--text-muted)" }}>{r.latest_year}</td>
                            <td style={{ fontSize: "0.7rem", color: "var(--text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.programs.slice(0, 2).join(", ")}
                              {r.programs.length > 2 && ` +${r.programs.length - 2}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === "trend" && (
                <div className="card">
                  <div className="card-title">Grant Funding Trend</div>
                  {trend && trend.length > 0 ? (
                    <>
                      <TrendChart data={trend} />
                      <table style={{ marginTop: "1rem" }}>
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th style={{ textAlign: "right" }}>Total Funding</th>
                            <th style={{ textAlign: "right" }}>Awards</th>
                            <th style={{ textAlign: "right" }}>Recipients</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trend.map(r => (
                            <tr key={r.year}>
                              <td>{r.year}</td>
                              <td style={{ textAlign: "right", color: "var(--success)" }}>{fmt(r.total_funding)}</td>
                              <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{r.award_count.toLocaleString()}</td>
                              <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{r.unique_recipients.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <div className="empty">No trend data available.</div>
                  )}
                </div>
              )}

              {tab === "eligibility" && (
                <div>
                  {eligibility.length === 0 ? (
                    <div className="empty">
                      No programs in our directory match this sector.<br />
                      <a href="https://www.canada.ca/en/services/business/grants.html" target="_blank" rel="noreferrer" style={{ color: "var(--info)", fontSize: "0.8rem" }}>
                        Browse all federal programs →
                      </a>
                    </div>
                  ) : (
                    eligibility.map(p => (
                      <div key={p.program_id} className="card" style={{ marginBottom: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                          <div className="card-title" style={{ margin: 0 }}>{p.program_name}</div>
                          <span className={`badge badge-${p.status === "open" ? "success" : "neutral"}`}>{p.status}</span>
                        </div>

                        {p.eligibility_text && (
                          <p style={{ fontSize: "0.82rem", color: "var(--text)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
                            {p.eligibility_text}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: "2rem", fontSize: "0.78rem", flexWrap: "wrap" }}>
                          {(p.min_funding !== null || p.max_funding !== null) && (
                            <div>
                              <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.65rem", letterSpacing: "0.06em" }}>Funding Range</span>
                              <div style={{ color: "var(--success)", fontWeight: 600, marginTop: 2 }}>
                                {p.min_funding !== null ? fmt(p.min_funding) : "—"}
                                {" – "}
                                {p.max_funding !== null ? fmt(p.max_funding) : "—"}
                              </div>
                            </div>
                          )}
                          {p.province_scope.length > 0 && (
                            <div>
                              <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.65rem", letterSpacing: "0.06em" }}>Scope</span>
                              <div style={{ marginTop: 2 }}>{p.province_scope.join(", ")}</div>
                            </div>
                          )}
                          {p.program_type && (
                            <div>
                              <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.65rem", letterSpacing: "0.06em" }}>Type</span>
                              <div style={{ marginTop: 2 }}>{p.program_type}</div>
                            </div>
                          )}
                        </div>

                        {p.source_url && (
                          <a
                            href={p.source_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-block", marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--info)" }}
                          >
                            Apply / Learn more →
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "programs" && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {programs && programs.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Program</th>
                          <th style={{ textAlign: "right" }}>Total Awarded</th>
                          <th style={{ textAlign: "right" }}>Awards</th>
                          <th style={{ textAlign: "right" }}>Median Award</th>
                          <th style={{ textAlign: "right" }}>Recipients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {programs.map(p => (
                          <tr key={p.program_name}>
                            <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.program_name}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 600 }}>{p.total_fmt}</td>
                            <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{p.award_count.toLocaleString()}</td>
                            <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{p.median_fmt}</td>
                            <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{p.unique_recipients.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty">No program data available.</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
