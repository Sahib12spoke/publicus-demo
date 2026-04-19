"use client";

import { useState, useEffect } from "react";
import { api, QaRow } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.qaReport(), api.health()])
      .then(([q, h]) => { setQa(q); setHealth(h as typeof health); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const errors   = qa.filter(r => r.severity === "error");
  const warnings = qa.filter(r => r.severity === "warning");

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
                    {qa.map(r => (
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
