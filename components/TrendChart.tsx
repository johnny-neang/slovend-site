"use client";

import { useState } from "react";

export type TrendPoint = { label: string; value: number; tip: string };
export type TrendBand = { min: number; max: number; color: string; quality: string };

/**
 * Lightweight SVG line chart for time-series.
 *
 * By default the Y axis auto-scales to the data (good for temperature). When
 * `yMin`/`yMax` are supplied the domain is fixed, and optional `bands` paint
 * horizontal quality zones (e.g. RSSI good/fair/poor) so a reading's position is
 * meaningful at a glance. A `legend` maps band colors to labels and `unit`
 * labels the Y axis. The SVG draws only shapes (it uses non-uniform scaling, so
 * text would distort) — all labels are HTML overlays.
 */
export default function TrendChart({
  data,
  height = 150,
  tone = "dark",
  bands,
  yMin,
  yMax,
  unit = "",
  legend = false,
}: {
  data: TrendPoint[];
  height?: number;
  tone?: "light" | "dark";
  bands?: TrendBand[];
  yMin?: number;
  yMax?: number;
  unit?: string;
  legend?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;
  const hasBands = Boolean(bands && bands.length);

  const W = 600;
  const H = height;
  const padX = 8;
  const padY = 10;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const values = data.map((d) => d.value);
  const lo = yMin ?? Math.min(...values);
  const hi = yMax ?? Math.max(...values);
  const span = hi - lo || 1;

  const x = (i: number) => (n <= 1 ? padX + plotW / 2 : padX + (i / (n - 1)) * plotW);
  const y = (v: number) => padY + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / span) * plotH;

  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const step = Math.max(1, Math.ceil(n / 6));

  const bandFor = (v: number) =>
    bands?.find((b) => v >= b.min && v <= b.max) ?? null;

  return (
    <div className={`tchart tchart--${tone}${hasBands ? " tchart--bands" : ""}`}>
      <div className="tchart-body">
        {(hasBands || unit) && (
          <div className="tchart-yaxis" aria-hidden="true">
            <span>
              {Math.round(hi)}
              {unit ? ` ${unit}` : ""}
            </span>
            <span>
              {Math.round(lo)}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        )}
        <div className="tchart-plot">
          <svg
            className="tchart-svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ height: H }}
            role="img"
            aria-label="Trend chart"
          >
            {hasBands &&
              bands!.map((b, i) => {
                const top = y(b.max);
                const bottom = y(b.min);
                return (
                  <rect
                    key={i}
                    x={padX}
                    y={top}
                    width={plotW}
                    height={Math.max(0, bottom - top)}
                    fill={b.color}
                    opacity={0.14}
                  />
                );
              })}
            {!hasBands && n > 0 && (
              <polygon
                className="tchart-area"
                points={`${padX},${padY + plotH} ${pts} ${padX + plotW},${padY + plotH}`}
              />
            )}
            {n > 1 && <polyline className="tchart-line" points={pts} />}
            {data.map((d, i) => {
              const b = bandFor(d.value);
              return (
                <circle
                  key={i}
                  className={`tchart-dot${active === i ? " on" : ""}`}
                  cx={x(i)}
                  cy={y(d.value)}
                  r={active === i ? 4 : 2.5}
                  style={b ? { fill: b.color } : undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                />
              );
            })}
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
      </div>
      {legend && hasBands && (
        <div className="tchart-legend">
          {bands!.map((b) => (
            <span key={b.quality} className="tchart-key">
              <span className="tchart-swatch" style={{ background: b.color }} />
              {b.quality}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
