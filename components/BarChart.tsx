"use client";

import { useState } from "react";

export type BarDatum = { label: string; value: number; tip: string };

/**
 * Lightweight interactive bar chart. Bar heights are computed in pixels (not CSS
 * %) so they render reliably across browsers, and hovering a bar shows a branded
 * tooltip with the underlying data. `tone` adapts colors for dark vs light cards.
 */
export default function BarChart({
  data,
  height = 150,
  tone = "light",
}: {
  data: BarDatum[];
  height?: number;
  tone?: "light" | "dark";
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const plotH = height - 22; // leave room for the axis labels
  const step = Math.max(1, Math.ceil(n / 8));

  return (
    <div className={`bchart bchart--${tone}`}>
      <div className="bchart-plot" style={{ height: plotH }}>
        {data.map((d, i) => (
          <button
            type="button"
            key={i}
            className="bchart-col"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((a) => (a === i ? null : a))}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((a) => (a === i ? null : a))}
            aria-label={d.tip}
          >
            <span
              className={`bchart-bar${active === i ? " on" : ""}`}
              style={{ height: Math.max(2, Math.round((d.value / max) * plotH)) }}
            />
          </button>
        ))}
        {active !== null && (
          <span
            className="bchart-tip"
            style={{
              left: `${Math.min(92, Math.max(8, ((active + 0.5) / n) * 100))}%`,
            }}
          >
            {data[active].tip}
          </span>
        )}
      </div>
      <div className="bchart-axis">
        {data.map((d, i) => (
          <span key={i} className="bchart-tick">
            {i % step === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
