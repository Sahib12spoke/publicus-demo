import Link from "next/link";
import { api } from "@/lib/api";
import { FlipStatBox } from "./flip-stat";

async function getStats() {
  try { return await api.stats(); } catch { return null; }
}

export default async function HomePage() {
  const stats = await getStats();

  return (
    <>
      <section className="hero">
        <h1>Your competitors are<br />grant-funded. Are you?</h1>
        <p>
          Canadian government grants are public data — but raw, unnormalized, and impossible to query competitively.
          Grant Radar turns 221K federal awards into a competitive intelligence layer:
          see which rivals are subsidized, from which programs, before they show up at your next RFP.
        </p>
        <div className="hero-actions">
          <Link href="/timeline" className="btn">See the Starting Line →</Link>
          <Link href="/radar" className="btn btn-secondary">Open Competitive Radar</Link>
        </div>
      </section>

      {stats && (
        <div className="stats">
          {[
            { value: stats.total_funding_fmt,             label: "Total Grants Tracked" },
            { value: stats.total_awards.toLocaleString(), label: "Award Records" },
            { value: stats.unique_recipients.toLocaleString(), label: "Unique Recipients" },
            { value: stats.year_range.replace(/(\d{4})-\d{2}/g, "$1"), label: "Fiscal Years" },
          ].map(({ value, label }) => (
            <div key={label} className="stat-box">
              <div className="value">{value}</div>
              <div className="label">{label}</div>
            </div>
          ))}
          <FlipStatBox
            value={`${stats.naics_coverage_pct}%`}
            label="Industry Classified"
            back="Only 4.8% of grant records include an industry (NAICS) code — the government rarely files one. Grant Radar infers the rest from program names and descriptions using keyword matching."
          />
        </div>
      )}

      <div className="feature-grid">
        {[
          {
            icon: "↗",
            href: "/timeline",
            title: "Grants → RFP Timeline",
            desc: "Publicus shows the race. Grant Radar shows the starting line — which companies got capability-building grants 12–18 months before the RFP.",
          },
          {
            icon: "◎",
            href: "/radar",
            title: "Competitive Radar",
            desc: "Enter your NAICS code and province. See every organization that received grants in your sector, ranked by total funding.",
          },
          {
            icon: "▦",
            href: "/map",
            title: "Sector Funding Map",
            desc: "Heatmap of federal grant spending by sector × province. Spot where government money is flowing before it becomes procurement.",
          },
          {
            icon: "∿",
            href: "/quality",
            title: "Pipeline Quality",
            desc: "7-stage data pipeline with full QA reporting. Entity resolution, deduplication, NAICS inference — see exactly how the data was built.",
          },
        ].map(({ icon, href, title, desc }) => (
          <Link href={href} key={title} style={{ textDecoration: "none" }}>
            <div className="feature-card">
              <div className="feature-icon">{icon}</div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Why this matters</div>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
          A competitor who received a $1M IRAP innovation grant will show up in the next RFP
          with a subsidized, battle-tested product. That's a material competitive disadvantage
          — and it's sitting in public data that nobody has organized.
          Grant Radar turns the{" "}
          <strong style={{ color: "var(--text)" }}>Open Canada Grants &amp; Contributions dataset</strong>
          {" "}into a competitive intelligence layer for Canadian B2G businesses.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">What's coming next</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "0.5rem" }}>
          {[
            { icon: "◎", title: "Competitor Alerts", desc: "Get notified when a rival receives a new grant. Stay ahead before they show up at your RFP." },
            { icon: "◈", title: "Program Intelligence Upgrade", desc: "Which programs fund companies in your space, with award-size distributions and open-vs-closed status." },
            { icon: "◈", title: "Provincial Grants", desc: "Ontario, Quebec, BC provincial programs — the federal dataset is just the start." },
            { icon: "∿", title: "Recipient Deep Dives", desc: "ML-powered NAICS classification and natural-language search across all 221K awards." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ borderLeft: "2px solid var(--border)", paddingLeft: "1rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>{icon} {title}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Data sources</div>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Coverage</th>
              <th>Update</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Federal Open Canada", "All departments, FY 2005–present", "Quarterly", "active"],
              ["Alberta Grants",      "Provincial awards, 2014–present",  "Quarterly", "planned"],
              ["Montreal Open Data",  "Municipal grants + contracts",      "Near real-time", "planned"],
            ].map(([src, cov, upd, status]) => (
              <tr key={src}>
                <td>{src}</td>
                <td style={{ color: "var(--text-muted)" }}>{cov}</td>
                <td style={{ color: "var(--text-muted)" }}>{upd}</td>
                <td>
                  <span className={`badge badge-${status === "active" ? "success" : "neutral"}`}>
                    {status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
