"use client";

import { useState, useEffect } from "react";
import { api, QaRow, Stats } from "@/lib/api";

const PIPELINE_STAGES = [
  { name: "Ingestion",         desc: "Load raw CSV (204 MB, 402K rows) from CKAN API or local file." },
  { name: "Normalization",     desc: "Standardize field names, parse dates, clean currency values, resolve bilingual EN/FR fields." },
  { name: "Deduplication",     desc: "Remove exact duplicates, then detect cross-source duplicates using blocking on province + fiscal year." },
  { name: "Consolidation",     desc: "Group amendment records — multiple rows for the same grant become one record with the latest value." },
  { name: "Entity Resolution", desc: "3-tier: Business Number exact match → rapidfuzz fuzzy match (blocking on province × name-prefix) → singletons. ~200× faster than naive O(n²)." },
  { name: "NAICS Inference",   desc: "Keyword-based NAICS classification for records missing industry codes. Covers software, cybersecurity, engineering, and 10+ other sectors." },
  { name: "QA Rules",          desc: "4 automated checks: negative values, implausible amounts (>$500M), missing recipients, missing award values." },
];

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function QualityPage() {
  const [qa, setQa] = useState<QaRow[]>([]);
  const [health, setHealth] = useState<{ status: string; records: number; program_records: number; cache: Record<string, unknown> } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.qaReport(), api.health(), api.stats()])
      .then(([q, h, s]) => { setQa(q); setHealth(h as typeof health); setStats(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const errors   = qa.filter(r => r.severity === "error"   && r.flagged > 0);
  const warnings = qa.filter(r => r.severity === "warning" && r.flagged > 0);

  return (
    <>
      <div className="section-header">
        <h2>Pipeline Quality</h2>
        <p>7-stage data pipeline · federal grants · {health?.records?.toLocaleString() ?? "—"} award records</p>
      </div>

      {loading && <div className="loading">Loading pipeline data…</div>}

      {!loading && (
        <>
          {/* Status bar */}
          <div className="stats" style={{ marginBottom: "2rem" }}>
            <div className="stat-box">
              <div className="value" style={{ color: health?.status === "ready" ? "var(--success)" : "var(--danger)" }}>
                {health?.status === "ready" ? "● live" : "● offline"}
              </div>
              <div className="label">Pipeline Status</div>
            </div>
            <div className="stat-box">
              <div className="value">{health?.records?.toLocaleString() ?? "—"}</div>
              <div className="label">Award Records</div>
            </div>
            <div className="stat-box">
              <div className="value">{health?.program_records ?? "—"}</div>
              <div className="label">Scraped Programs</div>
            </div>
            <div className="stat-box">
              <div className="value" style={{ color: errors.length === 0 ? "var(--success)" : "var(--danger)" }}>
                {errors.length === 0 ? "0 errors" : `${errors.length} errors`}
              </div>
              <div className="label">QA Errors</div>
            </div>
            <div className="stat-box">
              <div className="value" style={{ color: warnings.length === 0 ? "var(--success)" : "var(--warning)" }}>
                {warnings.length} warnings
              </div>
              <div className="label">QA Warnings</div>
            </div>
          </div>

          {/* QA Report */}
          <div style={{ marginBottom: "2rem" }}>
            <div className="card-title">QA Report</div>
            {qa.length === 0 ? (
              <div className="empty">No QA data available.</div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Rule</th>
                      <th>Description</th>
                      <th style={{ textAlign: "right" }}>Flagged</th>
                      <th style={{ textAlign: "right" }}>% of Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qa.filter(r => r.flagged > 0).map(r => (
                      <tr key={r.rule}>
                        <td>
                          <span className={`badge badge-${r.severity === "error" ? "danger" : "warning"}`}>
                            {r.severity}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{r.rule}</td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{r.description}</td>
                        <td style={{ textAlign: "right" }}>{r.flagged.toLocaleString()}</td>
                        <td style={{ textAlign: "right", color: r.pct > 5 ? "var(--warning)" : "var(--text-muted)" }}>
                          {r.pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* NAICS coverage */}
          <div style={{ marginBottom: "2rem" }}>
            <div className="card-title">Industry (NAICS) Coverage</div>
            <div className="card" style={{ lineHeight: 1.7 }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 0 }}>
                NAICS industry codes are the backbone of the Competitive Radar — they're how we answer "who got grants in <em>my</em> sector?" Being transparent about coverage matters more than the number looking good.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", margin: "1rem 0" }}>
                <div style={{ borderLeft: "2px solid var(--success)", paddingLeft: "1rem" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>
                    {stats ? `${stats.naics_coverage_pct}%` : "—"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Current coverage
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                    Records with a NAICS code after source + keyword inference.
                  </div>
                </div>

                <div style={{ borderLeft: "2px solid var(--border)", paddingLeft: "1rem" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>40–50%</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Target (next)
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                    Batched LLM NAICS2 classification on <code>recipient_name + program + description</code>.
                  </div>
                </div>
              </div>

              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.5rem 0" }}>
                <strong style={{ color: "var(--text)" }}>Why it's low:</strong> Treasury Board makes the NAICS field optional on the Proactive Disclosure of Grants &amp; Contributions, and most departments don't file one. Our keyword rules only catch records where a sector is explicitly named in the description (e.g. "cybersecurity", "aerospace").
              </p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.5rem 0" }}>
                <strong style={{ color: "var(--text)" }}>How Radar still works today:</strong> Competitive Radar and Sector Map operate on the classified subset — fewer records but still directionally correct rankings for sectors like IT/consulting (NAICS 5415), engineering (5413), and manufacturing (31–33). Timeline and Recipient pages aggregate on entity-resolved recipients regardless of NAICS, so they're unaffected.
              </p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.5rem 0 0" }}>
                <strong style={{ color: "var(--text)" }}>What's next:</strong> A two-step enrichment layer — (1) batched LLM NAICS2 inference as a separate parquet artifact with per-record provenance (<code>original</code> / <code>keyword</code> / <code>llm</code>), (2) spot-check before surfacing in Radar queries. Kept decoupled from the main pipeline so a bad LLM run doesn't degrade the rest of the dashboard.
              </p>
            </div>
          </div>

          {/* Pipeline stages */}
          <div className="card-title">7-Stage Pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {PIPELINE_STAGES.map((s, i) => (
              <div key={s.name} className="card" style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                <div style={{
                  minWidth: 28, height: 28, background: "var(--bg-hover)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 700, color: "var(--success)", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.2rem" }}>{s.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
