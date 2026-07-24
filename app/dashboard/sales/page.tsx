import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import {
  getLastSales,
  saleAmount,
  saleLabel,
  saleSlot,
  saleLocalTime,
  salePayment,
  type Sale,
} from "@/lib/nayax";
import { getMachineTimezone } from "@/lib/settings";

export const metadata: Metadata = { title: "Sales · Slovend Intelligence" };
export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const ctx = await getCtx();
  if (!ctx.conn) redirect("/dashboard");
  if (ctx.error || !ctx.machine)
    return (
      <DashError
        title={ctx.error ? "Couldn't reach Nayax" : "No machines found"}
        message={ctx.error ?? "No machines returned for this account."}
      />
    );

  const [sales, tz] = await Promise.all([
    getLastSales(ctx.conn, ctx.machineId).catch(() => [] as Sale[]),
    ctx.email
      ? getMachineTimezone(ctx.email, ctx.machineId)
      : Promise.resolve("America/Los_Angeles"),
  ]);
  const revenue = sales.reduce((s, x) => s + saleAmount(x), 0);

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Recent sales</h1>
          </div>
          <span className="status live">
            <span className="dot" />
            {sales.length} vends · ${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="table-card">
          <table className="dtable">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Product</th>
                <th>Time</th>
                <th>Payment</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sales.length ? (
                sales.map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{saleSlot(s)}</td>
                    <td>{saleLabel(s)}</td>
                    <td className="muted">{saleLocalTime(s, tz)}</td>
                    <td className="muted">{salePayment(s) || "—"}</td>
                    <td className="r amt">${saleAmount(s).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="muted">
                    No recent sales returned by Lynx.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ textAlign: "left", marginTop: 14 }}>
          Lynx returns only the most recent transactions · full history builds up under Reports
        </p>
      </div>
    </section>
  );
}
