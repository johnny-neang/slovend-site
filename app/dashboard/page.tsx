import type { Metadata } from "next";
import { auth } from "@/auth";
import {
  listMachines,
  getLastSales,
  saleAmount,
  saleLabel,
  saleTime,
  type Machine,
  type Sale,
} from "@/lib/nayax";
import { getConnection } from "@/lib/connections";
import { connectNayax, disconnectNayax } from "./actions";

export const metadata: Metadata = { title: "Dashboard · Slovend" };
export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const first = session?.user?.name?.split(" ")[0];
  const email = session?.user?.email?.toLowerCase();
  const conn = email ? await getConnection(email) : null;
  const sp = await searchParams;

  // ---- Not connected: per-user "Connect your Nayax account" form ----
  if (!conn) {
    return (
      <section className="section dash-page">
        <div className="wrap">
          <div className="dash-head">
            <div>
              <div className="kicker">Vendai dashboard</div>
              <h1 className="serif-display">
                {first ? `Welcome, ${first}.` : "Welcome."}
              </h1>
            </div>
          </div>

          <div className="connect-card">
            <h2>Connect your Nayax account</h2>
            <p>
              Vendai reads your fleet using <strong>your own</strong> Nayax Lynx
              API token. It&apos;s stored only for your session — never shared
              with other users.
            </p>
            {sp?.error === "token" ? (
              <div className="auth-error">An API token is required.</div>
            ) : null}
            <form action={connectNayax}>
              <div className="field">
                <label htmlFor="base">Lynx API base URL</label>
                <input
                  id="base"
                  name="base"
                  defaultValue="https://lynx.nayax.com"
                />
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
                  Machine ID{" "}
                  <span style={{ opacity: 0.6 }}>(optional)</span>
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

  // ---- Connected: pull live data ----
  let machineName = "Your fleet";
  let sales: Sale[] = [];
  let error: string | null = null;

  try {
    const machines = await listMachines(conn);
    let machine: Machine | undefined;
    if (conn.machineId) {
      machine =
        machines.find((m) => String(m.MachineID) === conn.machineId) ??
        machines[0];
    } else {
      machine = machines[0];
    }
    const id = machine?.MachineID ?? conn.machineId;
    if (machine?.MachineName) machineName = machine.MachineName;
    else if (id) machineName = `Machine ${id}`;
    if (id) sales = await getLastSales(conn, id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach Nayax";
  }

  const vends = sales.length;
  const revenue = sales.reduce((sum, s) => sum + saleAmount(s), 0);
  const recent = sales.slice(0, 10);
  const hasRevenue = revenue > 0;

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Vendai dashboard</div>
            <h1 className="serif-display">{machineName}</h1>
          </div>
          <div className="dash-actions">
            <span className="status live">
              <span className="dot" />
              Connected
            </span>
            <form action={disconnectNayax}>
              <button type="submit" className="btn-mini dark">
                Disconnect
              </button>
            </form>
          </div>
        </div>

        {error ? (
          <div className="empty-state">
            <div className="seal">!</div>
            <h2>Couldn&apos;t reach Nayax</h2>
            <p>{error}</p>
            <form action={disconnectNayax} style={{ marginTop: 18 }}>
              <button type="submit" className="btn btn-gold">
                Re-enter credentials
              </button>
            </form>
          </div>
        ) : (
          <div className="dash-grid">
            <div className="dash-mock">
              <div className="tiles">
                <div className="tile">
                  <div className="l">Recent revenue</div>
                  <div className="n">
                    {hasRevenue
                      ? `$${revenue.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}`
                      : "—"}
                  </div>
                  <div className="d">from last sales</div>
                </div>
                <div className="tile">
                  <div className="l">Recent vends</div>
                  <div className="n">{vends}</div>
                  <div className="d">transactions</div>
                </div>
              </div>
            </div>

            <div className="recent">
              <div className="rhead">Recent sales</div>
              {recent.length ? (
                recent.map((s, i) => (
                  <div className="row" key={i}>
                    <span>
                      {saleLabel(s)}
                      {saleTime(s) ? ` · ${saleTime(s)}` : ""}
                    </span>
                    <span className="amt">${saleAmount(s).toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="empty">No recent sales returned.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
