"use client";

import { useState, useEffect } from "react";
import { api, NaicsSector, ProgramRow, ProgramMetadata } from "@/lib/api";

const TYPE_LABEL: Record<string, string> = {
  grant: "Grant",
  loan: "Loan",
  repayable: "Repayable",
  tax_credit: "Tax Credit",
};

function FundingRange({ min, max }: { min: number | null; max: number | null }) {
  const fmt = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;
  if (min && max && min !== max) return <>{fmt(min)} – {fmt(max)}</>;
  if (max) return <>Up to {fmt(max)}</>;
  if (min) return <>From {fmt(min)}</>;
  return <>—</>;
}

export default function ProgramsPage() {
  const [sectors, setSectors] = useState<NaicsSector[]>([]);
  const [naics, setNaics] = useState("");
  const [topN, setTopN] = useState(20);
  const [programs, setPrograms] = useState<ProgramRow[] | null>(null);
  const [metadata, setMetadata] = useState<ProgramMetadata[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.naicsSectors().then(setSectors).catch(() => {});
    // Load program metadata upfront — independent of NAICS selection
    setMetaLoading(true);
    api.programs()
      .then(setMetadata)
      .catch(() => setMetadata([]))
      .finally(() => setMetaLoading(false));
  }, []);

  async function runQuery() {
    if (!naics) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.programIntelligence(naics, topN);
      setPrograms(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  const maxTotal = programs ? Math.max(...programs.map(p => p.total_awarded)) : 1;

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Program Intelligence</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Which programs fund companies in your sector? Ranked by total disbursed with median award size.
        </p>
      </div>

      {/* ── Award-based program intelligence ── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 240px" }}>
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
          </div>
          <div style={{ flex: "0 1 120px" }}>
            <label className="filter-label">Top N programs</label>
            <select
              className="filter-select"
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
            >
              {[10, 20, 50].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            onClick={runQuery}
            disabled={!naics || loading}
            style={{ flex: "0 0 auto", alignSelf: "flex-end" }}
          >
            {loading ? "Loading…" : "Search →"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--danger)" }}>{error}</div>
        )}
      </div>

      {loading && <div className="loading">Loading…</div>}

      {programs && !loading && (
        programs.length === 0 ? (
          <div className="empty">No programs found for this sector.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Program Name</th>
                  <th style={{ textAlign: "right" }}>Total Awarded</th>
                  <th style={{ textAlign: "right" }}>Awards</th>
                  <th style={{ textAlign: "right" }}>Median Award</th>
                  <th style={{ textAlign: "right" }}>Recipients</th>
                  <th style={{ width: 120 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p, i) => {
                  const pct = maxTotal > 0 ? (p.total_awarded / maxTotal) * 100 : 0;
                  return (
                    <tr key={p.program_name}>
                      <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                      <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                        {p.program_name}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 600 }}>
                        {p.total_fmt}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                        {p.award_count.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                        {p.median_fmt}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                        {p.unique_recipients.toLocaleString()}
                      </td>
                      <td>
                        <div style={{
                          height: 6,
                          borderRadius: 2,
                          background: "var(--border)",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: "var(--accent)",
                            borderRadius: 2,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {!programs && !loading && (
        <div className="empty" style={{ marginBottom: "1.5rem" }}>
          Select a NAICS sector to see which programs fund that space.
        </div>
      )}

      {/* ── Scraped program metadata (unstructured pipeline) ── */}
      <div style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.15rem" }}>Program Directory</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
          Eligibility, funding caps, and status — extracted from government program pages.
        </p>
      </div>

      {metaLoading && <div className="loading">Loading program directory…</div>}

      {metadata && !metaLoading && (
        metadata.length === 0 ? (
          <div className="empty">Program directory unavailable — scraper returned no results.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {metadata.map(prog => (
              <div key={prog.program_id} className="card" style={{ position: "relative" }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{prog.program_name}</span>
                    <span style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.7rem",
                      padding: "0.15rem 0.45rem",
                      borderRadius: 3,
                      background: prog.status === "open" ? "var(--success-muted, #0d2e1a)" : "var(--danger-muted, #2e0d0d)",
                      color: prog.status === "open" ? "var(--success)" : "var(--danger)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}>
                      {prog.status}
                    </span>
                    <span style={{
                      marginLeft: "0.4rem",
                      fontSize: "0.7rem",
                      padding: "0.15rem 0.45rem",
                      borderRadius: 3,
                      background: "var(--surface-alt, #1a1a2e)",
                      color: "var(--text-muted)",
                    }}>
                      {TYPE_LABEL[prog.program_type] ?? prog.program_type}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: 600, whiteSpace: "nowrap" }}>
                    <FundingRange min={prog.min_funding} max={prog.max_funding} />
                  </div>
                </div>

                {/* Description */}
                {prog.description && (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.5rem", lineHeight: 1.6 }}>
                    {prog.description}
                  </p>
                )}

                {/* Eligibility */}
                {prog.eligibility_text && (
                  <div style={{ fontSize: "0.78rem", color: "var(--text)", background: "var(--surface-alt, #0f0f1a)", borderLeft: "3px solid var(--accent)", padding: "0.4rem 0.6rem", borderRadius: "0 3px 3px 0", margin: "0 0 0.5rem", lineHeight: 1.6 }}>
                    <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.68rem", letterSpacing: "0.05em", display: "block", marginBottom: "0.2rem" }}>Eligibility</span>
                    {prog.eligibility_text}
                  </div>
                )}

                {/* Footer: NAICS + scope + link */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {prog.naics_codes.length > 0 && (
                    <span>NAICS: {prog.naics_codes.join(", ")}</span>
                  )}
                  {prog.naics_keywords.length > 0 && (
                    <span>Keywords: {prog.naics_keywords.slice(0, 4).join(", ")}</span>
                  )}
                  {prog.province_scope.length > 0 && (
                    <span>Scope: {prog.province_scope.join(", ")}</span>
                  )}
                  <a href={prog.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: "auto", color: "var(--accent)", textDecoration: "none" }}>
                    View program →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <div className="card-title">How to use this data</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
          <p>Programs with high <strong style={{ color: "var(--text)" }}>total awarded</strong> have the most budget flowing into your sector —
          these are the programs your competitors are winning. Programs with high <strong style={{ color: "var(--text)" }}>median award</strong>{" "}
          relative to total are less competitive (fewer recipients splitting the pot).</p>
          <p style={{ marginTop: "0.5rem" }}>
            The <strong style={{ color: "var(--text)" }}>Program Directory</strong> below the award table shows eligibility criteria and
            funding caps extracted directly from government HTML pages — use it to quickly assess whether your company qualifies before
            applying. Use the <a href="/radar">Competitive Radar</a> to see which organizations are winning each program.
          </p>
        </div>
      </div>
    </>
  );
}
