import type { ProductMedia } from "@/lib/product-media";
import {
  productName,
  productSlot,
  productMdbCode,
  productNayaxId,
  productPar,
  productPrice,
  productMissing,
  productVendedOut,
  productLowStock,
  catalogName,
  catalogImage,
  catalogDescription,
  type Product,
  type CatalogProduct,
} from "@/lib/nayax";

/**
 * Per-slot inventory view model, shared by the operator Inventory grid and the
 * public vending page so both resolve image/name/price/description identically.
 */

export type Source = "manual" | "nayax" | null;

export type InvRow = {
  key: string;
  slot: string;
  rowNum: number; // 9999 = "Other" (unmapped / MDB 0)
  col: number;
  mdb: number | null;
  name: string;
  image: string | null;
  description: string | null;
  source: Source;
  price: number | null;
  par: number | null;
  missing: number | null;
  out: boolean;
  low: boolean;
  manual: ProductMedia | null;
};

export type InvGridRow = { rowNum: number; items: InvRow[] };

/** Build rows from a planogram with precedence: manual override -> Nayax catalog
 * -> bare slot. `media` is keyed by MDBCode, `catalog` by NayaxProductID. */
export function buildInventoryRows(input: {
  products: Product[];
  media: Map<number, ProductMedia>;
  catalog: Map<number, CatalogProduct>;
}): InvRow[] {
  const { products, media, catalog } = input;
  return products.map((p, i) => {
    const slot = productSlot(p);
    const mdb = productMdbCode(p);
    const nayaxId = productNayaxId(p);
    const cat = nayaxId ? catalog.get(nayaxId) : undefined;
    const man = mdb != null && mdb > 0 ? media.get(mdb) ?? null : null;
    const fallbackName =
      productName(p) || (slot !== "—" ? `Selection ${slot}` : "—");

    let name = fallbackName;
    let image: string | null = null;
    let description: string | null = null;
    let source: Source = null;

    if (man && (man.name || man.imageUrl || man.description)) {
      name = man.name || fallbackName;
      image = man.imageUrl;
      description = man.description;
      source = "manual";
    } else if (cat && (catalogName(cat) || catalogImage(cat))) {
      name = catalogName(cat) || fallbackName;
      image = catalogImage(cat) || null;
      description = catalogDescription(cat) || null;
      source = "nayax";
    }

    const rowNum = slot !== "—" ? Number(slot.slice(0, -2)) : NaN;
    const col = slot !== "—" ? Number(slot.slice(-2)) : NaN;

    return {
      key: String(i),
      slot,
      rowNum: Number.isFinite(rowNum) ? rowNum : 9999,
      col: Number.isFinite(col) ? col : 0,
      mdb,
      name,
      image,
      description,
      source,
      price: productPrice(p),
      par: productPar(p),
      missing: productMissing(p),
      out: productVendedOut(p),
      low: productLowStock(p),
      manual: man,
    };
  });
}

/** Group rows by machine row, packing each row left-to-right by column (no gaps). */
export function packInventoryGrid(rows: InvRow[]): InvGridRow[] {
  const byRow = new Map<number, InvRow[]>();
  for (const r of rows) {
    const arr = byRow.get(r.rowNum) ?? [];
    arr.push(r);
    byRow.set(r.rowNum, arr);
  }
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, items]) => ({
      rowNum: n,
      items: items.sort((a, b) => a.col - b.col),
    }));
}
