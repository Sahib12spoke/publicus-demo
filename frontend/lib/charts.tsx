"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, LineChart, Line, Legend,
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

/* ── Multi-line Timeline Chart ────────────────────────────────────────────── */
const LINE_COLORS = [
  "#3ea16b", "#6aa7ff", "#e6b84a", "#c08bf5", "#ff8863",
  "#4cc3c3", "#f07a9a", "#9bc34a", "#a38860", "#8a8fd3",
];

export interface TimelineSeries {
  key: string;        // entity_id
  name: string;       // recipient_name
  sector?: string;
}

export interface TimelinePoint { fy: string; [key: string]: number | string; }

export function TimelineChart({
  data,
  series,
  onSeriesClick,
}: {
  data: TimelinePoint[];
  series: TimelineSeries[];
  onSeriesClick?: (entityId: string) => void;
}) {
  if (!data.length || !series.length) return <div className="empty">No timeline data</div>;
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="fy"
          interval={0}
          tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          height={50}
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
          formatter={(val: number, name: string) => [fmt(val), name]}
          cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
        />
        <Legend
          wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", paddingTop: 8 }}
          iconType="plainline"
          onClick={(o) => onSeriesClick?.(o.dataKey as string)}
        />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={s.key}
            name={s.name}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={1.5}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Lane Timeline (recipient-per-row, Gantt-style) ──────────────────────── */

export interface LaneYearly { fy: string; value: number; count: number; }
export interface LaneRecipient {
  entity_id: string;
  name: string;
  total_fmt: string;
  province?: string | null;
  yearly: LaneYearly[];
}

export function LaneTimelineChart({
  recipients,
  years,
  selected,
  onSelect,
}: {
  recipients: LaneRecipient[];
  years: string[];
  selected?: string | null;
  onSelect?: (entityId: string) => void;
}) {
  if (!recipients.length || !years.length) return <div className="empty">No timeline data</div>;

  const maxValue = Math.max(
    ...recipients.flatMap(r => r.yearly.map(y => y.value)),
    1,
  );
  const MIN_R = 4;
  const MAX_R = 18;
  const dotRadius = (v: number) => MIN_R + Math.sqrt(v / maxValue) * (MAX_R - MIN_R);

  const xPercent = (fy: string) => {
    const idx = years.indexOf(fy);
    if (idx < 0) return -1;
    return years.length === 1 ? 50 : (idx / (years.length - 1)) * 100;
  };

  const tickIndices =
    years.length <= 8
      ? years.map((_, i) => i)
      : Array.from({ length: 6 }, (_, k) => Math.round((k / 5) * (years.length - 1)));

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {recipients.map((r, i) => {
        const isSel = selected === r.entity_id;
        const color = LINE_COLORS[i % LINE_COLORS.length];
        return (
          <div
            key={r.entity_id}
            onClick={() => onSelect?.(r.entity_id)}
            style={{
              display: "grid",
              gridTemplateColumns: "240px 1fr 90px",
              alignItems: "center",
              padding: "6px 8px",
              background: isSel ? "var(--bg-hover)" : "transparent",
              borderLeft: `2px solid ${isSel ? color : "transparent"}`,
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
              fontSize: "0.78rem",
              transition: "background 0.12s ease",
            }}
          >
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
              <span style={{ color: "var(--text-muted)", marginRight: 8, fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              {r.province && (
                <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: "0.7rem" }}>· {r.province}</span>
              )}
            </div>
            <div style={{ position: "relative", height: 36, margin: "0 14px" }}>
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--border)" }} />
              {r.yearly.filter(y => y.value > 0).map(y => {
                const x = xPercent(y.fy);
                if (x < 0) return null;
                const rad = dotRadius(y.value);
                return (
                  <div
                    key={y.fy}
                    title={`${r.name}\n${y.fy} · ${fmt(y.value)}${y.count > 1 ? ` (${y.count} grants)` : ""}`}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: `${x}%`,
                      width: rad * 2,
                      height: rad * 2,
                      marginLeft: -rad,
                      marginTop: -rad,
                      borderRadius: "50%",
                      background: color,
                      border: "2px solid var(--bg)",
                      boxShadow: "0 0 0 1px " + color + "55",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ color: "var(--text)", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
              {r.total_fmt}
            </div>
          </div>
        );
      })}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 90px", marginTop: 6 }}>
        <div />
        <div style={{ position: "relative", height: 20, margin: "0 14px" }}>
          {tickIndices.map(i => {
            const x = years.length === 1 ? 50 : (i / (years.length - 1)) * 100;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: 0,
                  transform: "translateX(-50%)",
                  fontSize: "0.65rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                }}
              >
                {years[i]}
              </div>
            );
          })}
        </div>
        <div />
      </div>
    </div>
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
