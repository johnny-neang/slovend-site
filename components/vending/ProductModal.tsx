"use client";

import type { VendProduct } from "@/components/vending/VendGrid";

export default function ProductModal({
  product,
  onClose,
}: {
  product: VendProduct | null;
  onClose: () => void;
}) {
  if (!product) return null;
  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pm-panel vend-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <span className="kicker">{product.out ? "Sold out" : "Item"}</span>
          <button type="button" className="pm-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="pm-thumb vend-modal-thumb">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt={product.name} />
          ) : (
            <span className="inv-thumb-ph">No photo</span>
          )}
        </div>
        <h3 className="vend-modal-name">{product.name}</h3>
        <div className="vend-modal-price">
          {product.price != null ? `$${product.price.toFixed(2)}` : ""}
        </div>
        <p className="vend-modal-desc">
          {product.description || "No description yet."}
        </p>
      </div>
    </div>
  );
}
