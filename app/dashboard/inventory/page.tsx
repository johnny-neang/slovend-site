import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import {
  getMachineProducts,
  productName,
  productBay,
  productStock,
  productCapacity,
  productPrice,
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
            {low.length ? `${low.length} low / ${products.length}` : `${products.length} bays`}
          </span>
        </div>

        <div className="table-card">
          <table className="dtable">
            <thead>
              <tr>
                <th>Bay</th>
                <th>Product</th>
                <th className="r">Stock</th>
                <th className="r">Capacity</th>
                <th className="r">Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length ? (
                products.map((p, i) => {
                  const stock = productStock(p);
                  const cap = productCapacity(p);
                  const price = productPrice(p);
                  const lowFlag = productLowStock(p);
                  return (
                    <tr key={i} className={lowFlag ? "row-low" : undefined}>
                      <td className="mono">{productBay(p) || "—"}</td>
                      <td>{productName(p)}</td>
                      <td className="r">{stock ?? "—"}</td>
                      <td className="r muted">{cap ?? "—"}</td>
                      <td className="r">{price != null ? `$${price.toFixed(2)}` : "—"}</td>
                      <td>
                        {lowFlag ? (
                          <span className="badge-low">Low stock</span>
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
      </div>
    </section>
  );
}
