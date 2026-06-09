import type { Metadata } from "next";
import Link from "next/link";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { connectNayax, disconnectNayax } from "./actions";
import {
  getMachineStatus,
  getLastSales,
  getMachineProducts,
  salePayment,
  productLowStock,
  statusOnline,
  statusLastSeen,
  statusSignal,
  statusTemp,
  type Sale,
  type Product,
} from "@/lib/nayax";
import { revalidatePath } from "next/cache";
import { ingestSales } from "@/lib/ingest";
import { recordHealth, healthTrend } from "@/lib/health";
import { overviewTotals } from "@/lib/reports";
import { getMachineTimezone, saveMachineTimezone, ALLOWED_TZ } from "@/lib/settings";
import TimezoneSelect from "@/components/TimezoneSelect";
import TrendChart, { type TrendPoint } from "@/components/TrendChart";

export const metadata: Metadata = { title: "Dashboard · Slovend" };
export const dynamic = "force-dynamic";

async function saveTimezoneAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await getCtx();
  if (!ctx.email || !ctx.machineId) return;
  await saveMachineTimezone(ctx.email, ctx.machineId, String(formData.get("timezone") ?? ""));
  revalidatePath("/dashboard");
}

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getCtx();
  const sp = await searchParams;

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

  if (ctx.error || !ctx.machine) {
    return (
      <section className="section dash-page">
        <div className="wrap">
          <div className="empty-state">
            <div className="seal">!</div>
            <h2>{ctx.error ? "Couldn't reach Nayax" : "No machines found"}</h2>
            <p>{ctx.error ?? "Your token works, but no machines were returned."}</p>
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

  const conn = ctx.conn;
  const id = ctx.machineId;

  // Note: lastAlerts returns the full event log (very large), so it is fetched
  // only on the Alerts page, not here.
  const [sales, products, status] = await Promise.all([
    getLastSales(conn, id).catch(() => [] as Sale[]),
    getMachineProducts(conn, id).catch(() => [] as Product[]),
    getMachineStatus(conn, id),
  ]);

  // Accumulate sales history on each visit, then read back defined windows so the
  // headline numbers have a clear timeframe (Lynx "recent" has no fixed range).
  if (ctx.email) await ingestSales(ctx.email, id, sales).catch(() => 0);
  const tot = ctx.email
    ? await overviewTotals(ctx.email, id)
    : { rev24: 0, v24: 0, rev7: 0, v7: 0 };
  const avg7 = tot.v7 ? tot.rev7 / tot.v7 : 0;
  const tz = ctx.email ? await getMachineTimezone(ctx.email, id) : "America/Los_Angeles";

  const vends = sales.length;
  const lowStock = products.filter(productLowStock);
  const online = statusOnline(status);
  const lastSeen = statusLastSeen(status);
  const signal = statusSignal(status);
  const temp = statusTemp(status);

  // Snapshot current health (throttled to ~hourly) and read back the trend so the
  // Overview can plot RSSI over time. No extra Nayax call — `status` is reused.
  let rssiPoints: TrendPoint[] = [];
  if (ctx.email) {
    await recordHealth(ctx.email, id, status).catch(() => {});
    const trend = await healthTrend(ctx.email, id).catch(() => null);
    rssiPoints = (trend?.samples ?? [])
      .filter((s): s is typeof s & { rssi: number } => s.rssi != null)
      .map((s) => {
        const d = new Date(s.at);
        const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        const when = new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: tz,
        }).format(d);
        return { label, value: s.rssi, tip: `${when} · RSSI ${s.rssi}` };
      });
  }

  const payMix = new Map<string, number>();
  for (const s of sales) payMix.set(salePayment(s) || "Unknown", (payMix.get(salePayment(s) || "Unknown") ?? 0) + 1);
  const payRows = [...payMix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

        <div className="machine-tz">
          <span className="mtz-label">Timezone</span>
          <TimezoneSelect value={tz} options={ALLOWED_TZ} action={saveTimezoneAction} />
          <span className="mtz-hint">
            Global for this machine — used for sales times, reports &amp; tax filing
          </span>
        </div>

        <div className="dash-mock" style={{ marginBottom: 20 }}>
          <div className="tiles tiles-4">
            <div className="tile">
              <div className="l">Last 24 hours</div>
              <div className="n">{tot.rev24 > 0 ? money(tot.rev24) : "—"}</div>
              <div className="d">{tot.v24} vends</div>
            </div>
            <div className="tile">
              <div className="l">Last 7 days</div>
              <div className="n">{tot.rev7 > 0 ? money(tot.rev7) : "—"}</div>
              <div className="d">{tot.v7} vends</div>
            </div>
            <div className="tile">
              <div className="l">Avg sale · 7d</div>
              <div className="n">{avg7 > 0 ? money(avg7) : "—"}</div>
              <div className="d">per vend</div>
            </div>
            <Link className="tile tile-link" href="/dashboard/inventory">
              <div className="l">Needs restock</div>
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
            <Link className="panel-link" href="/dashboard/sales">
              View sales feed →
            </Link>
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
                <span>Signal (RSSI)</span>
                <b>{signal ?? "—"}</b>
              </div>
              <div>
                <span>Temperature</span>
                <b>{temp || "—"}</b>
              </div>
            </div>

            <div className="health-trend">
              <div className="ht-label">Signal (RSSI) · 7d</div>
              {rssiPoints.length >= 2 ? (
                <TrendChart data={rssiPoints} tone="light" height={120} />
              ) : (
                <div className="muted">
                  Signal trend builds as samples accumulate (captured hourly).
                </div>
              )}
            </div>

            <Link className="panel-link" href="/dashboard/alerts">
              View alerts &amp; events →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
