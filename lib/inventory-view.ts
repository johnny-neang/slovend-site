import type { ProductMedia } from "@/lib/product-media";
import { mdbToSlot } from "@/lib/slot-code";
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
export type Presence = "synced" | "manual";

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
  presence: Presence; // synced = Nayax returns this slot; manual = declared only
  hidden: boolean; // phantom suppressed (flagged here; dropped at the call site)
  price: number | null;
  par: number | null;
  missing: number | null;
  out: boolean;
  low: boolean;
  manual: ProductMedia | null;
};

export type InvGridRow = { rowNum: number; items: InvRow[] };

/**
 * Build the union of Nayax products and operator-declared manual slots, deduped
 * by MDBCode. Precedence per slot: manual override -> Nayax catalog -> bare slot.
 * `media` is keyed by MDBCode, `catalog` by NayaxProductID.
 *
 * A row's `presence` is "synced" when Nayax returns the slot, "manual" when the
 * operator declared it but Nayax isn't returning it yet. `hidden` is flagged for
 * phantom rows (e.g. MDB 0) but rows are NOT dropped here — the call site decides
 * whether to show them, so the operator page can offer a "show hidden" toggle.
 */
export function buildInventoryRows(input: {
  products: Product[];
  media: Map<number, ProductMedia>;
  catalog: Map<number, CatalogProduct>;
}): InvRow[] {
  const { products, media, catalog } = input;
  const rows: InvRow[] = [];
  const seen = new Set<number>(); // MDBCodes covered by a Nayax product
  const seenSlots = new Set<string>(); // rendered slot strings covered by a Nayax product

  // Pass 1 — Nayax products (existing precedence), tagged synced + hidden.
  products.forEach((p, i) => {
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
    if (mdb != null && mdb > 0) seen.add(mdb);
    if (slot !== "—") seenSlots.add(slot); // so a manual decl for this slot links, not duplicates
    // The mdb_code 0 sentinel hides only genuinely-unmapped rows (MDB 0 / "—").
    // A row with no MDBCode but a real PACode slot is NOT swept up by it.
    const isUnmapped = mdb === 0 || slot === "—";
    const hidden =
      mdb != null && mdb > 0
        ? man?.hidden === true
        : isUnmapped
          ? media.get(0)?.hidden === true
          : false;

    rows.push({
      key: String(i),
      slot,
      rowNum: Number.isFinite(rowNum) ? rowNum : 9999,
      col: Number.isFinite(col) ? col : 0,
      mdb,
      name,
      image,
      description,
      source,
      presence: "synced",
      hidden,
      price: productPrice(p),
      par: productPar(p),
      missing: productMissing(p),
      out: productVendedOut(p),
      low: productLowStock(p),
      manual: man,
    });
  });

  // Pass 2 — operator-declared slots Nayax isn't returning (manual-only).
  for (const [mdb, man] of media) {
    // Only well-formed slots: row byte present (mdb >= 256) and column in the
    // 2-digit slot range. This skips the MDB-0 sentinel and degenerate codes.
    if (mdb < 256 || (mdb & 0xff) > 99) continue;
    if (seen.has(mdb)) continue; // already rendered above as a synced row
    if (!(man.manualSlot || man.name || man.imageUrl || man.description)) continue;

    const slot = mdbToSlot(mdb);
    if (seenSlots.has(slot)) continue; // a Nayax row (e.g. PACode) already shows this slot
    const rowNum = Number(slot.slice(0, -2));
    const col = Number(slot.slice(-2));
    const hasMedia = Boolean(man.name || man.imageUrl || man.description);

    // Keep hidden manual rows in the set (flagged) so the page's show-hidden
    // toggle + per-row Unhide can recover them — don't drop them here.
    rows.push({
      key: `m${mdb}`,
      slot,
      rowNum: Number.isFinite(rowNum) ? rowNum : 9999,
      col: Number.isFinite(col) ? col : 0,
      mdb,
      name: man.name || `Selection ${slot}`,
      image: man.imageUrl,
      description: man.description,
      source: hasMedia ? "manual" : null,
      presence: "manual",
      hidden: man.hidden === true,
      price: null,
      par: null,
      missing: null,
      out: false,
      low: false,
      manual: man,
    });
  }

  return rows;
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
