import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import ProductMediaEditor from "@/components/ProductMediaEditor";
import AddSlotEditor from "@/components/AddSlotEditor";
import SlotPriceEditor from "@/components/SlotPriceEditor";
import { setSlotHidden } from "@/app/dashboard/inventory/actions";
import { hasVerifiedCanary } from "@/lib/planogram-writes";
import { getProductMedia, type ProductMedia } from "@/lib/product-media";
import {
  getMachineProducts,
  productNayaxId,
  productLowStock,
  getCatalogProducts,
  type Product,
  type CatalogProduct,
} from "@/lib/nayax";
import {
  buildInventoryRows,
  packInventoryGrid,
  type InvRow,
} from "@/lib/inventory-view";
import { vendsBySlot, shareOfVendsAfter } from "@/lib/reports";
import { getMachineTimezone } from "@/lib/settings";

export const metadata: Metadata = { title: "Inventory · Slovend Intelligence" };
export const dynamic = "force-dynamic";

type SP = { view?: string; hidden?: string };

/** Small server-action form to hide/unhide a slot (mdbCode 0 = unmapped group). */
function HideForm({ mdbCode, hidden, label }: { mdbCode: number; hidden: boolean; label: string }) {
  return (
    <form action={setSlotHidden} className="inv-hide-form">
      <input type="hidden" name="mdbCode" value={mdbCode} />
      <input type="hidden" name="hidden" value={hidden ? "1" : "0"} />
      <button type="submit" className="inv-hide-btn">
        {label}
      </button>
    </form>
  );
}

/** Presence pill: declared-but-absent ("Not in Nayax") or linked after declaring ("Synced"). */
function PresenceBadge({ row }: { row: InvRow }) {
  if (row.presence === "manual") return <span className="inv-pres manual">Not in Nayax</span>;
  if (row.manual?.manualSlot) return <span className="inv-pres synced">Synced</span>;
  return null;
}

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

  const sp = await searchParams;
  const view: "list" | "grid" = sp.view === "grid" ? "grid" : "list";
  const showHidden = sp.hidden === "1";

  const products = await getMachineProducts(ctx.conn, ctx.machineId).catch(
    () => [] as Product[],
  );
  const low = products.filter(productLowStock);

  // Price/par editing stays locked until the write canary has proven the path.
  const canaryVerified = ctx.email
    ? await hasVerifiedCanary(ctx.email, ctx.machineId)
    : false;

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

  // Union of Nayax products + operator-declared manual slots, with precedence
  // per slot: manual override -> Nayax catalog -> bare slot.
  const rows = buildInventoryRows({ products, media, catalog });
  const visible = rows.filter((r) => !r.hidden);
  const hiddenCount = rows.length - visible.length;
  const unmappedHidden = media.get(0)?.hidden === true;
  // Group by row, pack each row left-to-right by column (no gaps).
  const gridRows = packInventoryGrid(showHidden ? rows : visible);
  const listRows = showHidden ? rows : visible;

  // Restock pick list: 7-day demand per slot, plus the machine's own timing
  // pattern. Names resolve through the same precedence as the grid above.
  const tz = ctx.email
    ? await getMachineTimezone(ctx.email, ctx.machineId)
    : "America/Los_Angeles";
  const [movers, timing] = ctx.email
    ? await Promise.all([
        vendsBySlot(ctx.email, ctx.machineId, 7),
        shareOfVendsAfter(ctx.email, ctx.machineId, tz, 12),
      ])
    : [[], null];
  const nameByMdb = new Map(rows.filter((r) => r.mdb != null).map((r) => [r.mdb as number, r]));

  // Preserve view/hidden across links.
  const href = (v: "list" | "grid", h: boolean) => {
    const p = new URLSearchParams();
    if (v === "grid") p.set("view", "grid");
    if (h) p.set("hidden", "1");
    const q = p.toString();
    return q ? `/dashboard/inventory?${q}` : "/dashboard/inventory";
  };

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
              <Link href={href("list", showHidden)} className={view === "list" ? "active" : undefined}>
                List
              </Link>
              <Link href={href("grid", showHidden)} className={view === "grid" ? "active" : undefined}>
                Grid
              </Link>
            </div>
            <AddSlotEditor />
            <span className={`status ${low.length ? "off" : "live"}`}>
              <span className="dot" />
              {low.length
                ? `${low.length} need attention / ${visible.length}`
                : `${visible.length} selections`}
            </span>
          </div>
        </div>

        {hiddenCount > 0 ? (
          <p className="inv-hidden-note">
            {showHidden ? (
              <>
                Showing {hiddenCount} hidden {hiddenCount === 1 ? "selection" : "selections"}.{" "}
                <Link href={href(view, false)}>Hide phantoms</Link>
              </>
            ) : (
              <>
                {hiddenCount} hidden {hiddenCount === 1 ? "selection" : "selections"}.{" "}
                <Link href={href(view, true)}>Show</Link>
              </>
            )}
          </p>
        ) : null}

        {view === "grid" ? (
          gridRows.length ? (
            <div className="inv-grid">
              {gridRows.map(({ rowNum, items }) => (
                <div key={rowNum}>
                  <div className="inv-row-label">
                    <span>{rowNum === 9999 ? "Other" : `Row ${rowNum}`}</span>
                    {rowNum === 9999 ? (
                      <HideForm
                        mdbCode={0}
                        hidden={!unmappedHidden}
                        label={unmappedHidden ? "Unhide unmapped" : "Hide unmapped (MDB 0)"}
                      />
                    ) : null}
                  </div>
                  <div className="inv-cards">
                    {items.map((r) => (
                      <div
                        key={r.key}
                        className={`inv-card${r.hidden ? " is-hidden" : r.out ? " is-out" : r.low ? " is-low" : ""}`}
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
                            <span className="inv-badges">
                              {r.source === "manual" ? (
                                <span className="inv-src manual">Manual</span>
                              ) : r.source === "nayax" ? (
                                <span className="inv-src nayax">Nayax</span>
                              ) : (
                                <span className="inv-src none">No info</span>
                              )}
                              {r.hidden ? (
                                <span className="inv-pres hidden">Hidden</span>
                              ) : (
                                <PresenceBadge row={r} />
                              )}
                            </span>
                            <span className="inv-actions">
                              {r.mdb != null && r.mdb > 0 ? (
                                <>
                                  <ProductMediaEditor
                                    mdbCode={r.mdb}
                                    slot={r.slot}
                                    hasManual={Boolean(r.manual)}
                                    initialName={r.manual?.name ?? null}
                                    initialDescription={r.manual?.description ?? null}
                                    initialImageUrl={r.manual?.imageUrl ?? null}
                                  />
                                  <HideForm
                                    mdbCode={r.mdb}
                                    hidden={!r.hidden}
                                    label={r.hidden ? "Unhide" : "Hide"}
                                  />
                                </>
                              ) : null}
                            </span>
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
                No planogram returned by Lynx. Use <strong>+ Add slot</strong> to declare one.
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
                {listRows.length ? (
                  listRows.map((r) => (
                    <tr key={r.key} className={r.hidden ? "row-hidden" : r.low ? "row-low" : undefined}>
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
                        {r.hidden ? (
                          <span className="inv-pres hidden" style={{ marginLeft: 8 }}>
                            Hidden
                          </span>
                        ) : (
                          <span style={{ marginLeft: 8 }}>
                            <PresenceBadge row={r} />
                          </span>
                        )}
                      </td>
                      <td className="r">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="r muted">{r.par ?? "—"}</td>
                      <td className="r muted">{r.missing ?? "—"}</td>
                      <td>
                        <span className="inv-status-cell">
                          {r.out ? (
                            <span className="badge-low">Vended out</span>
                          ) : r.low ? (
                            <span className="badge-low">Low</span>
                          ) : (
                            <span className="badge-ok">OK</span>
                          )}
                          {/* Editable only when Nayax can address the row AND the
                              slot has a product — an unassigned slot fails
                              Nayax's write validation. */}
                          {r.machineProductId != null && r.nayaxProductId != null ? (
                            <SlotPriceEditor
                              machineProductId={r.machineProductId}
                              slot={r.slot}
                              name={r.name}
                              price={r.price}
                              par={r.par}
                              canaryVerified={canaryVerified}
                            />
                          ) : null}
                          {r.mdb != null && r.mdb > 0 ? (
                            <HideForm
                              mdbCode={r.mdb}
                              hidden={!r.hidden}
                              label={r.hidden ? "Unhide" : "Hide"}
                            />
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="muted">
                      No planogram returned by Lynx. Use “+ Add slot” to declare one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {movers.length > 0 && (
          <div className="panel pick-list" style={{ marginTop: 22 }}>
            <div className="panel-h-row">
              <div className="panel-h">Restock pick list · last 7 days</div>
              {timing && timing.pct >= 60 && (
                <span className="panel-badge">
                  {timing.pct}% of vends after noon — restock before 12pm
                </span>
              )}
            </div>
            <div className="table-card" style={{ border: "none" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Product</th>
                    <th className="r">Vends</th>
                    <th className="r">Revenue</th>
                    <th>Last sold</th>
                  </tr>
                </thead>
                <tbody>
                  {movers.map((m) => {
                    const row = nameByMdb.get(m.mdb);
                    return (
                      <tr key={m.mdb}>
                        <td className="mono">{m.slot}</td>
                        <td>{row?.name || `Slot ${m.slot}`}</td>
                        <td className="r">{m.vends}</td>
                        <td className="r amt">${m.revenue.toFixed(2)}</td>
                        <td className="muted">
                          {m.lastSold
                            ? new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                                timeZone: tz,
                              }).format(new Date(m.lastSold))
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ textAlign: "left", marginTop: 10 }}>
              Busiest selections first — what to load before your next visit.
              Vend counts come from recorded sales, not from machine stock levels.
            </p>
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
        <p className="note" style={{ textAlign: "left", marginTop: 6 }}>
          Nayax is the source of truth. If a slot is missing, <strong>+ Add slot</strong>{" "}
          declares it manually (flagged <strong>Not in Nayax</strong>); it switches to{" "}
          <strong>Synced</strong> once Nayax starts reporting that MDB code. Use{" "}
          <strong>Hide</strong> to suppress phantom selections such as MDB&nbsp;0.
        </p>
      </div>
    </section>
  );
}
