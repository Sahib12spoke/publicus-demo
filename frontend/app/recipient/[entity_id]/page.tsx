"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, RecipientProfile } from "@/lib/api";

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function RecipientPage() {
  const { entity_id } = useParams<{ entity_id: string }>();
  const [profile, setProfile] = useState<RecipientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"awards" | "programs" | "departments">("awards");

  useEffect(() => {
    api.recipient(entity_id)
      .then(setProfile)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [entity_id]);

  if (loading) return <div className="loading">Loading profile…</div>;
  if (error)   return <div className="empty">Error: {error}</div>;
  if (!profile) return null;

  const years = Object.keys(profile.by_year).sort();
  const maxYearVal = Math.max(...Object.values(profile.by_year), 1);

  return (
    <>
      {/* Back link */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/radar" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          ← Back to Radar
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ marginBottom: "0.35rem" }}>{profile.recipient_name ?? entity_id}</h1>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {profile.province && <span className="badge badge-neutral">{profile.province}</span>}
              {profile.city    && <span className="badge badge-neutral">{profile.city}</span>}
              {profile.recipient_bn && (
                <span className="badge badge-info">BN: {profile.recipient_bn}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--success)" }}>
              {profile.total_funding_fmt}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              total grants received
            </div>
          </div>
        </div>
      </div>

      {/* Stat boxes */}
      <div className="stats" style={{ marginBottom: "2rem" }}>
        <div className="stat-box">
          <div className="value">{profile.grant_count.toLocaleString()}</div>
          <div className="label">Total Awards</div>
        </div>
        <div className="stat-box">
          <div className="value">{profile.first_year ?? "—"}</div>
          <div className="label">First Grant</div>
        </div>
        <div className="stat-box">
          <div className="value">{profile.latest_year ?? "—"}</div>
          <div className="label">Latest Grant</div>
        </div>
        <div className="stat-box">
          <div className="value">{Object.keys(profile.top_programs).length}</div>
          <div className="label">Programs Used</div>
        </div>
      </div>

      {/* Funding by year bar chart */}
      {years.length > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title">Funding by Fiscal Year</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {years.map(y => {
              const v = profile.by_year[y];
              const pct = (v / maxYearVal) * 100;
              return (
                <div key={y} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.8rem" }}>
                  <div style={{ width: 90, flexShrink: 0, color: "var(--text-muted)" }}>{y}</div>
                  <div style={{ flex: 1, background: "var(--bg-hover)", height: 8, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--success)", borderRadius: 2, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ width: 70, textAlign: "right", color: "var(--success)", fontWeight: 600, flexShrink: 0 }}>
                    {fmt(v)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: "1rem" }}>
        {(["awards", "programs", "departments"] as const).map(t => (
          <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "awards"      ? `Awards (${profile.awards.length}${profile.grant_count > 50 ? ", showing 50" : ""})` :
             t === "programs"    ? `Programs (${Object.keys(profile.top_programs).length})` :
                                   `Departments (${Object.keys(profile.top_departments).length})`}
          </button>
        ))}
      </div>

      {/* Awards table */}
      {tab === "awards" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Program</th>
                <th>Department</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>NAICS</th>
              </tr>
            </thead>
            <tbody>
              {profile.awards.map((a, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-muted)" }}>{a.fiscal_year ?? "—"}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.program_name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {a.department ?? "—"}
                  </td>
                  <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 600 }}>{a.award_fmt}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{a.naics_code ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Programs breakdown */}
      {tab === "programs" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th style={{ textAlign: "right" }}>Awards</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(profile.top_programs).map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Departments breakdown */}
      {tab === "departments" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th style={{ textAlign: "right" }}>Awards</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(profile.top_departments).map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
