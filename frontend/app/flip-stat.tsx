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
      style={{ position: "relative", minHeight: 80 }}
    >
      <div className="flip-card-inner">
        <div className="flip-card-front">
          <div className="value">{value}</div>
          <div className="label">{label} ⓘ</div>
        </div>
        <div className="flip-card-back">
          {back}
        </div>
      </div>
    </div>
  );
}
