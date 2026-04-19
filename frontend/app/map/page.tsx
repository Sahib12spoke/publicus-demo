import { api } from "@/lib/api";
import { SectorHeatmap } from "@/lib/charts";

async function getData() {
  try { return await api.sectorHeatmap(); } catch { return null; }
}

export default async function MapPage() {
  const data = await getData();

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Sector Funding Map</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Federal grant spending by industry sector × province. Cell color intensity = funding volume.
          Hover a cell to see the dollar amount.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Federal Grants · Sector × Province Heatmap</div>
        {data ? (
          <>
            <SectorHeatmap data={data} />
            <div style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Values represent total grant funding (all fiscal years). Darker cell = more funding.
              NAICS 2-digit sector codes mapped to Statistics Canada sector labels.
            </div>
          </>
        ) : (
          <div className="empty">
            Heatmap data unavailable — backend may still be loading.
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <div className="card-title">How to read this map</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: "0.25rem" }}>Bright cells</div>
            High grant concentration — this sector/province combination attracts significant federal funding.
            Expect more subsidized competitors here.
          </div>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: "0.25rem" }}>Dark cells</div>
            Low or zero funding in this sector/province. Either an underserved market or grant programs
            have not historically targeted this combination.
          </div>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: "0.25rem" }}>Strategy</div>
            If your sector is bright in a province you operate in, use the{" "}
            <a href="/radar">Competitive Radar</a> to identify the specific organizations
            receiving those grants.
          </div>
        </div>
      </div>
    </>
  );
}
