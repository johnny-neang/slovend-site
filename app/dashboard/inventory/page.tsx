import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import {
  getMachineProducts,
  productName,
  productSlot,
  productPar,
  productPrice,
  productMissing,
  productVendedOut,
  productLowStock,
  type Product,
} from "@/lib/nayax";

export const metadata: Metadata = { title: "Inventory · Vendai" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await getCtx();
  if (!ctx.conn) redirect("/dashboard");
  if (ctx.error || !ctx.machine)
    return (
      <DashError
        title={ctx.error ? "Couldn't reach Nayax" : "No machines found"}
        message={ctx.error ?? "No machines returned for this account."}
      />
    );

  const products = await getMachineProducts(ctx.conn, ctx.machineId).catch(
    () => [] as Product[],
  );
  const low = products.filter(productLowStock);

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Inventory</h1>
          </div>
          <span className={`status ${low.length ? "off" : "live"}`}>
            <span className="dot" />
            {low.length ? `${low.length} need attention / ${products.length}` : `${products.length} selections`}
          </span>
        </div>

        <div className="table-card">
          <table className="dtable">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Product</th>
                <th className="r">Price</th>
                <th className="r">Par</th>
                <th className="r">Sold↑</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length ? (
                products.map((p, i) => {
                  const bay = productSlot(p);
                  const par = productPar(p);
                  const price = productPrice(p);
                  const missing = productMissing(p);
                  const out = productVendedOut(p);
                  const low2 = productLowStock(p);
                  return (
                    <tr key={i} className={low2 ? "row-low" : undefined}>
                      <td className="mono">{bay || "—"}</td>
                      <td>{productName(p) || (bay ? `Selection ${bay}` : "—")}</td>
                      <td className="r">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
                      <td className="r muted">{par ?? "—"}</td>
                      <td className="r muted">{missing ?? "—"}</td>
                      <td>
                        {out ? (
                          <span className="badge-low">Vended out</span>
                        ) : low2 ? (
                          <span className="badge-low">Low</span>
                        ) : (
                          <span className="badge-ok">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    No planogram returned by Lynx.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ textAlign: "left", marginTop: 14 }}>
          &quot;Sold↑&quot; = units sold since last refill · live stock counts appear when the machine reports DEX/planogram data
        </p>
      </div>
    </section>
  );
}
