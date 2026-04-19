"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, TimelineData, TimelineRecipient } from "@/lib/api";
import { LaneTimelineChart, LaneRecipient } from "@/lib/charts";

const DEFAULT_SECTORS = "5415,54161,54133,5112,5182,54171";

const PROVINCE_NAMES: Record<string, string> = {
  ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta",
  MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick",
  NL: "Newfoundland & Labrador", PE: "Prince Edward Island",
  YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut",
};

function yearRange(first: string | null, latest: string | null): string {
  if (!first && !latest) return "—";
  if (!first) return latest!;
  if (!latest || first === latest) return first;
  return `${first} → ${latest}`;
}

function fyStart(fy: string | null | undefined): number | null {
  if (!fy) return null;
  const m = String(fy).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

export default function TimelinePage() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [sectors, setSectors] = useState<string>(DEFAULT_SECTORS);
  const [topN, setTopN] = useState<number>(10);
  const [minAward, setMinAward] = useState<number>(100_000);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.timeline(topN, sectors, minAward)
      .then(setData)
      .catch(() => setData({ recipients: [], years: [] }))
      .finally(() => setLoading(false));
  }, [topN, sectors, minAward]);

  const laneRecipients: LaneRecipient[] = useMemo(
    () =>
      (data?.recipients || []).map(r => ({
        entity_id: r.entity_id,
        name: r.recipient_name,
        total_fmt: r.total_funding_fmt,
        province: r.province,
        yearly: r.yearly,
      })),
    [data],
  );

  const totalFunding = useMemo(
    () => (data?.recipients || []).reduce((s, r) => s + r.total_funding, 0),
    [data],
  );
  const fmtTotal = totalFunding >= 1e9
    ? `$${(totalFunding / 1e9).toFixed(1)}B`
    : totalFunding >= 1e6
      ? `$${(totalFunding / 1e6).toFixed(1)}M`
      : `$${(totalFunding / 1e3).toFixed(0)}K`;

  // Find province pattern (dominant province if ≥60% of recipients are from one)
  const headline = useMemo(() => {
    const recips = data?.recipients || [];
    if (!recips.length) return null;
    const byProv: Record<string, number> = {};
    recips.forEach(r => {
      const p = r.province || "—";
      byProv[p] = (byProv[p] || 0) + 1;
    });
    const [topProv, topCount] = Object.entries(byProv).sort((a, b) => b[1] - a[1])[0];
    const provShare = topCount / recips.length;
    const provPhrase =
      provShare >= 0.6 && topProv !== "—"
        ? `${recips.length} ${PROVINCE_NAMES[topProv] || topProv} companies`
        : `${recips.length} Canadian companies`;

    const starts = recips
      .flatMap(r => r.yearly.filter(y => y.value > 0).map(y => fyStart(y.fy)))
      .filter((n): n is number => n !== null);
    const latestFY = Math.max(...starts);
    const earliestFY = Math.min(...starts);
    const yrSpan = Math.max(1, latestFY - earliestFY + 1);
    const spanPhrase = yrSpan <= 1 ? "in a single fiscal year" : `over ${yrSpan} fiscal years`;

    return { provPhrase, spanPhrase };
  }, [data]);

  const selectedRecipient: TimelineRecipient | undefined = useMemo(
    () => data?.recipients.find(r => r.entity_id === selected),
    [data, selected],
  );

  return (
    <>
      <div className="section-header">
        <h2>Grants → RFP Timeline</h2>
        <p>Grant funding as a leading indicator of procurement competition.</p>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
          Publicus shows the race. <strong style={{ color: "var(--text)" }}>Grant Radar shows the starting line.</strong>
          {headline ? (
            <>
              {" "}{headline.spanPhrase},{" "}
              <strong style={{ color: "var(--text)" }}>{headline.provPhrase}</strong>{" "}
              received <strong style={{ color: "var(--text)" }}>{fmtTotal}</strong> in federal grants to
              build capabilities the government will procure next. When the RFPs drop, they'll be bidding
              with an 18-month head start their competitors can't see.
            </>
          ) : (
            <> These are the capability-building grants that precede procurement competition.</>
          )}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          sectors
          <select value={sectors} onChange={e => setSectors(e.target.value)} className="filter-select" style={{ width: "auto", minWidth: 240 }}>
            <option value="5415,54161,54133,5112,5182,54171">IT · Consulting · Engineering · R&D (default)</option>
            <option value="5415,5112,5182">Software & IT services only</option>
            <option value="5415">5415 – Computer Systems Design</option>
            <option value="54161">54161 – Management Consulting</option>
            <option value="54133">54133 – Engineering Services</option>
            <option value="54171">54171 – Engineering & Life-Science R&D</option>
            <option value="5415,54161">IT + Consulting</option>
            <option value="51,54,33">Loose: IT / Professional / Advanced Mfg (2-digit)</option>
          </select>
        </label>
        <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          min grant
          <select value={minAward} onChange={e => setMinAward(Number(e.target.value))} className="filter-select" style={{ width: "auto", minWidth: 120 }}>
            <option value={0}>any</option>
            <option value={50_000}>$50K+</option>
            <option value={100_000}>$100K+</option>
            <option value={250_000}>$250K+</option>
            <option value={500_000}>$500K+</option>
            <option value={1_000_000}>$1M+</option>
          </select>
        </label>
        <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          top
          <select value={topN} onChange={e => setTopN(Number(e.target.value))} className="filter-select" style={{ width: "auto", minWidth: 100 }}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
          </select>
        </label>
      </div>

      {loading && <div className="loading">Loading timeline…</div>}

      {!loading && data && data.recipients.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div className="card-title">Funding over time — top recipients</div>
            <LaneTimelineChart
              recipients={laneRecipients}
              years={data.years}
              selected={selected}
              onSelect={(id) => setSelected(id)}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.75rem", marginBottom: 0 }}>
              Each row is a recipient. Dots mark grant years — dot size scales with award amount.
              Clusters of spikes mean capability-building. Expect related RFP bids ~12–18 months later.
            </p>
          </div>

          {selectedRecipient && (
            <div className="card" style={{ marginBottom: "1.5rem", borderLeft: "3px solid var(--accent)" }}>
              <div className="card-title">{selectedRecipient.recipient_name}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                {selectedRecipient.sector_label} · {selectedRecipient.province || "—"} ·{" "}
                {yearRange(selectedRecipient.first_year, selectedRecipient.latest_year)} ·{" "}
                {selectedRecipient.grant_count} grants ·{" "}
                <strong style={{ color: "var(--text)" }}>{selectedRecipient.total_funding_fmt}</strong> total
              </div>
              {selectedRecipient.top_program && (
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Top program: {selectedRecipient.top_program}
                </div>
              )}
              <div style={{ marginTop: "0.75rem" }}>
                <Link href={`/recipient/${selectedRecipient.entity_id}`} className="btn btn-secondary">
                  Open full profile →
                </Link>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Recipient</th>
                  <th>Sector</th>
                  <th>Prov</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "right" }}>Grants</th>
                  <th>Years</th>
                  <th>Top program</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.map(r => (
                  <tr
                    key={r.entity_id}
                    style={{ cursor: "pointer", background: selected === r.entity_id ? "var(--bg-hover)" : undefined }}
                    onClick={() => setSelected(r.entity_id)}
                  >
                    <td style={{ color: "var(--text-muted)" }}>{r.rank}</td>
                    <td style={{ fontWeight: 500 }}>{r.recipient_name}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{r.sector_label}</td>
                    <td style={{ color: "var(--text-muted)" }}>{r.province || "—"}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.total_funding_fmt}</td>
                    <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{r.grant_count}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                      {yearRange(r.first_year, r.latest_year)}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.78rem", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.top_program || "—"}
                    </td>
                    <td>
                      <Link href={`/recipient/${r.entity_id}`} style={{ fontSize: "0.75rem" }}>open →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && data && data.recipients.length === 0 && (
        <div className="empty">No recipients in the selected sectors.</div>
      )}
    </>
  );
}
