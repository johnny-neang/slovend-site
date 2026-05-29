import type { Metadata } from "next";
import { auth } from "@/auth";
import {
  nayaxConfigured,
  defaultMachineId,
  getMachine,
  getLastSales,
  saleAmount,
  saleLabel,
  saleTime,
  type Sale,
} from "@/lib/nayax";

export const metadata: Metadata = { title: "Dashboard · Slovend" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  const first = session?.user?.name?.split(" ")[0];

  // No Nayax token yet -> friendly connect state (app still deploys cleanly).
  if (!nayaxConfigured()) {
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
          <div className="empty-state">
            <div className="seal">✦</div>
            <h2>Connect your Nayax account</h2>
            <p>
              Your dashboard is ready. Add your Nayax Lynx API token to start
              showing live machine, sales and inventory data.
            </p>
            <p style={{ marginTop: 14 }}>
              Set <code>NAYAX_API_TOKEN</code> and <code>NAYAX_MACHINE_ID</code>{" "}
              in the environment.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const machineId = defaultMachineId();
  let machineName = machineId ? `Machine ${machineId}` : "Your fleet";
  let sales: Sale[] = [];
  let error: string | null = null;

  try {
    if (machineId) {
      const [m, s] = await Promise.all([
        getMachine(machineId),
        getLastSales(machineId),
      ]);
      if (m?.MachineName) machineName = m.MachineName;
      sales = s;
    }
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
          <span className="status live">
            <span className="dot" />
            Live
          </span>
        </div>

        {error ? (
          <div className="empty-state">
            <div className="seal">!</div>
            <h2>Couldn&apos;t reach Nayax</h2>
            <p>{error}</p>
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
