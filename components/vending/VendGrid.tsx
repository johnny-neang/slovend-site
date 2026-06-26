"use client";

import { useEffect, useRef, useState } from "react";
import ProductModal from "@/components/vending/ProductModal";

export type VendProduct = {
  id: string;
  name: string;
  slot: string;
  price: number | null;
  image: string | null;
  description: string | null;
  out: boolean;
};

export type VendRow = { rowNum: number; items: VendProduct[] };

function Tile({ p, onOpen }: { p: VendProduct; onOpen: () => void }) {
  return (
    <button type="button" className={`vend-tile${p.out ? " is-out" : ""}`} onClick={onOpen}>
      <span className="vend-tile-thumb">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.name} loading="lazy" />
        ) : (
          <span className="inv-thumb-ph">—</span>
        )}
        {p.out ? <span className="vend-soldout">Sold out</span> : null}
      </span>
      <span className="vend-tile-name">{p.name}</span>
      <span className="vend-tile-foot">
        <span className="vend-tile-slot">#{p.slot}</span>
        <span className="vend-tile-price">
          {p.price != null ? `$${p.price.toFixed(2)}` : ""}
        </span>
      </span>
    </button>
  );
}

export default function VendGrid({ rows }: { rows: VendRow[] }) {
  const [selected, setSelected] = useState<VendProduct | null>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scrollable, setScrollable] = useState<boolean[]>([]);

  // Mark rows whose track overflows so the fade + swipe hint show only when useful.
  useEffect(() => {
    const measure = () =>
      setScrollable(
        trackRefs.current.map((t) => !!t && t.scrollWidth > t.clientWidth + 4),
      );
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rows]);

  return (
    <>
      <section className="vend-grid" aria-label="Products">
        {rows.map((row, i) => (
          <div className={`vend-row${scrollable[i] ? " is-scrollable" : ""}`} key={row.rowNum}>
            <div
              className="vend-row-track"
              ref={(el) => {
                trackRefs.current[i] = el;
              }}
            >
              {row.items.map((p) => (
                <Tile key={p.id} p={p} onOpen={() => setSelected(p)} />
              ))}
            </div>
            <span className="vend-row-hint" aria-hidden="true">
              Swipe →
            </span>
          </div>
        ))}
      </section>
      <ProductModal product={selected} onClose={() => setSelected(null)} />
    </>
  );
}
