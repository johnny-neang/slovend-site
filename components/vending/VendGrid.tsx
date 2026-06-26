"use client";

import { useState } from "react";
import ProductModal from "@/components/vending/ProductModal";

export type VendProduct = {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  description: string | null;
  out: boolean;
};

export default function VendGrid({ products }: { products: VendProduct[] }) {
  const [selected, setSelected] = useState<VendProduct | null>(null);

  return (
    <>
      <section className="vend-grid" aria-label="Products">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`vend-tile${p.out ? " is-out" : ""}`}
            onClick={() => setSelected(p)}
          >
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
            <span className="vend-tile-price">
              {p.price != null ? `$${p.price.toFixed(2)}` : ""}
            </span>
          </button>
        ))}
      </section>
      <ProductModal product={selected} onClose={() => setSelected(null)} />
    </>
  );
}
