"use client";
import { useState } from "react";

export function FlipStatBox({
  value, label, back,
}: {
  value: string; label: string; back: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className={`stat-box flip-card${flipped ? " flipped" : ""}`}
      onClick={() => setFlipped(f => !f)}
      title="Click to learn more"
      style={{ position: "relative" }}
    >
      {/* front face — normal flow, sets the box height */}
      <div style={{ visibility: flipped ? "hidden" : "visible" }}>
        <div className="value">{value}</div>
        <div className="label">{label} ⓘ</div>
      </div>

      {/* back face — overlaid when flipped */}
      {flipped && (
        <div style={{
          position: "absolute", inset: 0,
          padding: "1rem 1.25rem",
          display: "flex", alignItems: "center",
          fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6,
          background: "var(--bg-secondary)",
          animation: "fadeIn 0.2s ease",
        }}>
          {back}
        </div>
      )}
    </div>
  );
}
