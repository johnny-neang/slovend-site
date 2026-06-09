"use client";

import { useState } from "react";

export type TrendPoint = { label: string; value: number; tip: string };

/**
 * Lightweight SVG line chart for time-series with an auto-scaled Y axis (values
 * aren't assumed zero-based — RSSI can be negative dBm or a small 0–31 scale).
 * Hovering a point shows a branded tooltip. `tone` adapts colors for dark vs
 * light cards, matching BarChart.
 */
export default function TrendChart({
  data,
  height = 150,
  tone = "dark",
}: {
  data: TrendPoint[];
  height?: number;
  tone?: "light" | "dark";
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;

  // viewBox coordinate space; CSS scales it to the container width.
  const W = 600;
  const H = height;
  const padX = 8;
  const padY = 14;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => (n <= 1 ? padX + plotW / 2 : padX + (i / (n - 1)) * plotW);
  const y = (v: number) => padY + (1 - (v - min) / span) * plotH;

  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const areaPts = n
    ? `${padX},${padY + plotH} ${pts} ${padX + plotW},${padY + plotH}`
    : "";
  const step = Math.max(1, Math.ceil(n / 6));

  return (
    <div className={`tchart tchart--${tone}`}>
      <svg
        className="tchart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: H }}
        role="img"
        aria-label="Trend chart"
      >
        {n > 0 && <polygon className="tchart-area" points={areaPts} />}
        {n > 1 && <polyline className="tchart-line" points={pts} />}
        {data.map((d, i) => (
          <circle
            key={i}
            className={`tchart-dot${active === i ? " on" : ""}`}
            cx={x(i)}
            cy={y(d.value)}
            r={active === i ? 4 : 2.5}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((a) => (a === i ? null : a))}
          />
        ))}
      </svg>
      {active !== null && (
        <span
          className="tchart-tip"
          style={{ left: `${Math.min(92, Math.max(8, (active / Math.max(1, n - 1)) * 100))}%` }}
        >
          {data[active].tip}
        </span>
      )}
      <div className="tchart-axis">
        {data.map((d, i) => (
          <span key={i} className="tchart-tick">
            {i % step === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
