import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import ProductMediaEditor from "@/components/ProductMediaEditor";
import { getProductMedia, type ProductMedia } from "@/lib/product-media";
import {
  getMachineProducts,
  productNayaxId,
  productLowStock,
  getCatalogProducts,
  type Product,
  type CatalogProduct,
} from "@/lib/nayax";
import { buildInventoryRows, packInventoryGrid } from "@/lib/inventory-view";

export const metadata: Metadata = { title: "Inventory · Vendai" };
export const dynamic = "force-dynamic";

type SP = { view?: string };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await getCtx();
  if (!ctx.conn) redirect("/dashboard");
  if (ctx.error || !ctx.machine)
    return (
      <DashError
        title={ctx.error ? "Couldn't reach Nayax" : "No machines found"}
        message={ctx.error ?? "No machines returned for this account."}
      />
    );

  const view: "list" | "grid" = (await searchParams).view === "grid" ? "grid" : "list";

  const products = await getMachineProducts(ctx.conn, ctx.machineId).catch(
    () => [] as Product[],
  );
  const low = products.filter(productLowStock);

  // Manual media (Neon) + best-effort Nayax catalog (often empty/403 today).
  const media = ctx.email
    ? await getProductMedia(ctx.email, ctx.machineId)
    : new Map<number, ProductMedia>();
  const nayaxIds = products
    .map(productNayaxId)
    .filter((n): n is number => n != null);
  const catalog: Map<number, CatalogProduct> = nayaxIds.length
    ? await getCatalogProducts(ctx.conn, nayaxIds).catch(
        () => new Map<number, CatalogProduct>(),
      )
    : new Map<number, CatalogProduct>();

  // Precedence per slot: manual override -> Nayax catalog -> bare slot.
  const rows = buildInventoryRows({ products, media, catalog });
  // Group by row, pack each row left-to-right by column (no gaps).
  const gridRows = packInventoryGrid(rows);

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Inventory</h1>
          </div>
          <div className="report-controls">
            <div className="range-tabs">
              <Link
                href="/dashboard/inventory"
                className={view === "list" ? "active" : undefined}
              >
                List
              </Link>
              <Link
                href="/dashboard/inventory?view=grid"
                className={view === "grid" ? "active" : undefined}
              >
                Grid
              </Link>
            </div>
            <span className={`status ${low.length ? "off" : "live"}`}>
              <span className="dot" />
              {low.length
                ? `${low.length} need attention / ${products.length}`
                : `${products.length} selections`}
            </span>
          </div>
        </div>

        {view === "grid" ? (
          products.length ? (
            <div className="inv-grid">
              {gridRows.map(({ rowNum, items }) => (
                <div key={rowNum}>
                  <div className="inv-row-label">
                    {rowNum === 9999 ? "Other" : `Row ${rowNum}`}
                  </div>
                  <div className="inv-cards">
                    {items.map((r) => (
                      <div
                        key={r.key}
                        className={`inv-card${r.out ? " is-out" : r.low ? " is-low" : ""}`}
                      >
                        <div className="inv-thumb">
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image} alt={r.name} loading="lazy" />
                          ) : (
                            <span className="inv-thumb-ph">{r.slot}</span>
                          )}
                        </div>
                        <div className="inv-card-body">
                          <div className="inv-slot mono">
                            {r.slot}
                            {r.mdb != null ? ` · MDB ${r.mdb}` : ""}
                          </div>
                          <div className="inv-name">{r.name}</div>
                          {r.description ? (
                            <div className="inv-desc muted">{r.description}</div>
                          ) : null}
                          <div className="inv-card-foot">
                            <span className="inv-price">
                              {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                            </span>
                            {r.out ? (
                              <span className="badge-low">Vended out</span>
                            ) : r.low ? (
                              <span className="badge-low">Low</span>
                            ) : (
                              <span className="badge-ok">OK</span>
                            )}
                          </div>
                          <div className="inv-card-meta">
                            {r.source === "manual" ? (
                              <span className="inv-src manual">Manual</span>
                            ) : r.source === "nayax" ? (
                              <span className="inv-src nayax">Nayax</span>
                            ) : (
                              <span className="inv-src none">No info</span>
                            )}
                            {r.mdb != null && r.mdb > 0 ? (
                              <ProductMediaEditor
                                mdbCode={r.mdb}
                                slot={r.slot}
                                hasManual={Boolean(r.manual)}
                                initialName={r.manual?.name ?? null}
                                initialDescription={r.manual?.description ?? null}
                                initialImageUrl={r.manual?.imageUrl ?? null}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-card">
              <p className="muted" style={{ padding: 16 }}>
                No planogram returned by Lynx.
              </p>
            </div>
          )
        ) : (
          <div className="table-card">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th className="r">MDB</th>
                  <th>Product</th>
                  <th className="r">Price</th>
                  <th className="r">Par</th>
                  <th className="r">Sold↑</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((r) => (
                    <tr key={r.key} className={r.low ? "row-low" : undefined}>
                      <td className="mono">{r.slot || "—"}</td>
                      <td className="r mono muted">{r.mdb ?? "—"}</td>
                      <td>
                        {r.name}
                        {r.source === "manual" ? (
                          <span className="inv-src manual" style={{ marginLeft: 8 }}>
                            Manual
                          </span>
                        ) : r.source === "nayax" ? (
                          <span className="inv-src nayax" style={{ marginLeft: 8 }}>
                            Nayax
                          </span>
                        ) : null}
                      </td>
                      <td className="r">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="r muted">{r.par ?? "—"}</td>
                      <td className="r muted">{r.missing ?? "—"}</td>
                      <td>
                        {r.out ? (
                          <span className="badge-low">Vended out</span>
                        ) : r.low ? (
                          <span className="badge-low">Low</span>
                        ) : (
                          <span className="badge-ok">OK</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="muted">
                      No planogram returned by Lynx.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="note" style={{ textAlign: "left", marginTop: 14 }}>
          &quot;Slot&quot; is decoded from the raw MDB code — row = MDB ÷ 256 (high
          byte), column = MDB mod 256 (low byte), shown as row + column
          zero-padded to two digits (e.g. MDB 1032 → 408). The grid groups by row
          and packs selections left-to-right.
        </p>
        <p className="note" style={{ textAlign: "left", marginTop: 6 }}>
          Product image, name &amp; description come from Nayax&apos;s catalog when
          available (flagged <strong>Nayax</strong>); otherwise add them per slot
          in the grid and they&apos;re flagged <strong>Manual</strong>. &quot;Sold↑&quot;
          = units sold since last refill.
        </p>
      </div>
    </section>
  );
}
