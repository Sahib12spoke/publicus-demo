"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";

/* ── shared tooltip style ──────────────────────────────────────────────── */
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: "2px",
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
  color: "var(--text)",
};

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/* ── Funding Trend Bar Chart ─────────────────────────────────────────────── */
interface TrendRow {
  year: string;
  total_funding: number;
  award_count: number;
  unique_recipients: number;
}

export function TrendChart({ data }: { data: TrendRow[] }) {
  if (!data.length) return <div className="empty">No trend data</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="year"
          tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(val: number) => [fmt(val), "Total Funding"]}
          cursor={{ fill: "var(--bg-hover)" }}
        />
        <Bar dataKey="total_funding" fill="var(--accent)" radius={[2, 2, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Sector Heatmap ──────────────────────────────────────────────────────── */
interface HeatmapData {
  sectors: string[];
  provinces: string[];
  values: number[][];
}

function heatColor(val: number, max: number): string {
  if (max === 0 || val === 0) return "var(--bg-secondary)";
  const intensity = val / max;
  // Dark → bright white-ish tint (monochrome)
  const alpha = 0.08 + intensity * 0.88;
  return `rgba(255,255,255,${alpha.toFixed(3)})`;
}

export function SectorHeatmap({ data }: { data: HeatmapData }) {
  const { sectors, provinces, values } = data;
  const allValues = values.flat();
  const maxVal = allValues.length ? Math.max(...allValues) : 1;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "var(--font-mono)", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
              Sector
            </th>
            {provinces.map(p => (
              <th key={p} style={{ padding: "6px 4px", color: "var(--text-muted)", fontWeight: 500, textAlign: "center", minWidth: 36 }}>
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector, si) => (
            <tr key={sector}>
              <td style={{ padding: "4px 8px", color: "var(--text-muted)", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                {sector}
              </td>
              {provinces.map((_, pi) => {
                const v = values[si]?.[pi] ?? 0;
                return (
                  <td
                    key={pi}
                    title={v > 0 ? fmt(v) : "—"}
                    style={{
                      background: heatColor(v, maxVal),
                      padding: "4px",
                      textAlign: "center",
                      borderRadius: "2px",
                      color: v / maxVal > 0.5 ? "#000" : "var(--text-muted)",
                      fontSize: "0.65rem",
                      cursor: v > 0 ? "default" : undefined,
                    }}
                  >
                    {v > 0 ? fmt(v) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
