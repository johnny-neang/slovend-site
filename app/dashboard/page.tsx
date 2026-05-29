import type { Metadata } from "next";
import Link from "next/link";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { connectNayax, disconnectNayax } from "./actions";
import {
  getMachineStatus,
  getLastSales,
  getLastAlerts,
  getMachineProducts,
  saleAmount,
  salePayment,
  productLowStock,
  statusOnline,
  statusLastSeen,
  type Sale,
  type Alert,
  type Product,
} from "@/lib/nayax";

export const metadata: Metadata = { title: "Dashboard · Slovend" };
export const dynamic = "force-dynamic";

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getCtx();
  const sp = await searchParams;

  // ---- Not connected: per-user connect form ----
  if (!ctx.conn) {
    return (
      <section className="section dash-page">
        <div className="wrap">
          <div className="dash-head">
            <div>
              <div className="kicker">Vendai dashboard</div>
              <h1 className="serif-display">Welcome.</h1>
            </div>
          </div>
          <div className="connect-card">
            <h2>Connect your Nayax account</h2>
            <p>
              Vendai reads your fleet using <strong>your own</strong> Nayax Lynx
              API token. It&apos;s encrypted and saved to your profile — never
              shared with other users.
            </p>
            {sp?.error === "token" ? (
              <div className="auth-error">An API token is required.</div>
            ) : null}
            <form action={connectNayax}>
              <div className="field">
                <label htmlFor="base">Lynx API base URL</label>
                <input id="base" name="base" defaultValue="https://lynx.nayax.com" />
              </div>
              <div className="field">
                <label htmlFor="token">API token</label>
                <input
                  id="token"
                  name="token"
                  type="password"
                  placeholder="Your Lynx bearer token"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="machineId">
                  Default machine ID <span style={{ opacity: 0.6 }}>(optional)</span>
                </label>
                <input id="machineId" name="machineId" placeholder="e.g. 5001" />
              </div>
              <button type="submit" className="btn btn-gold">
                Connect
              </button>
            </form>
          </div>
        </div>
      </section>
    );
  }

  // ---- Connected but Lynx unreachable / no machines ----
  if (ctx.error || !ctx.machine) {
    return (
      <section className="section dash-page">
        <div className="wrap">
          <div className="empty-state">
            <div className="seal">!</div>
            <h2>{ctx.error ? "Couldn't reach Nayax" : "No machines found"}</h2>
            <p>
              {ctx.error ??
                "Your token works, but no machines were returned for this account."}
            </p>
            <form action={disconnectNayax} style={{ marginTop: 18 }}>
              <button type="submit" className="btn btn-gold">
                Re-enter credentials
              </button>
            </form>
          </div>
        </div>
      </section>
    );
  }

  // ---- Connected: machine overview ----
  const conn = ctx.conn;
  const id = ctx.machineId;

  const [sales, alerts, products, status] = await Promise.all([
    getLastSales(conn, id).catch(() => [] as Sale[]),
    getLastAlerts(conn, id).catch(() => [] as Alert[]),
    getMachineProducts(conn, id).catch(() => [] as Product[]),
    getMachineStatus(conn, id),
  ]);

  const revenue = sales.reduce((s, x) => s + saleAmount(x), 0);
  const vends = sales.length;
  const lowStock = products.filter(productLowStock);
  const online = statusOnline(status);
  const lastSeen = statusLastSeen(status);

  // payment mix from recent sales
  const payMix = new Map<string, number>();
  for (const s of sales) {
    const k = salePayment(s) || "Unknown";
    payMix.set(k, (payMix.get(k) ?? 0) + 1);
  }
  const payRows = [...payMix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Vendai dashboard</div>
            <h1 className="serif-display">{machineLabel(ctx.machine)}</h1>
          </div>
          <span className={`status ${online === false ? "off" : "live"}`}>
            <span className="dot" />
            {online === false ? "Offline" : online === true ? "Online" : "Connected"}
          </span>
        </div>

        <div className="dash-mock" style={{ marginBottom: 20 }}>
          <div className="tiles tiles-4">
            <div className="tile">
              <div className="l">Recent revenue</div>
              <div className="n">
                {revenue > 0
                  ? `$${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "—"}
              </div>
              <div className="d">last sales</div>
            </div>
            <div className="tile">
              <div className="l">Recent vends</div>
              <div className="n">{vends}</div>
              <div className="d">transactions</div>
            </div>
            <Link className="tile tile-link" href="/dashboard/alerts">
              <div className="l">Open alerts</div>
              <div className="n">{alerts.length}</div>
              <div className="d">view all →</div>
            </Link>
            <Link className="tile tile-link" href="/dashboard/inventory">
              <div className="l">Low stock</div>
              <div className="n">{lowStock.length}</div>
              <div className="d">view planogram →</div>
            </Link>
          </div>
        </div>

        <div className="panel-grid">
          <div className="panel">
            <div className="panel-h">Payment mix · recent</div>
            {payRows.length ? (
              <div className="bars-h">
                {payRows.map(([k, v]) => (
                  <div className="bar-h" key={k}>
                    <span className="bk">{k}</span>
                    <span className="bv">
                      <span style={{ width: `${Math.round((v / vends) * 100)}%` }} />
                    </span>
                    <span className="bn">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No recent sales.</div>
            )}
          </div>
          <div className="panel">
            <div className="panel-h">Health</div>
            <div className="kv">
              <div>
                <span>Connectivity</span>
                <b>{online === false ? "Offline" : online === true ? "Online" : "—"}</b>
              </div>
              <div>
                <span>Last seen</span>
                <b>{lastSeen || "—"}</b>
              </div>
              <div>
                <span>Selected machine</span>
                <b>{id}</b>
              </div>
            </div>
            <Link className="panel-link" href="/dashboard/sales">
              View sales feed →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
