import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import {
  getLastAlerts,
  alertText,
  alertTime,
  alertCategory,
  type Alert,
} from "@/lib/nayax";

export const metadata: Metadata = { title: "Alerts · Vendai" };
export const dynamic = "force-dynamic";

const SHOW = 50;

function sev(a: Alert): "high" | "med" | "low" {
  const s = `${alertText(a)} ${alertCategory(a)}`.toLowerCase();
  if (/(error|fault|fail|jam|critical|tamper|offline|down|empty|vend out)/.test(s)) return "high";
  if (/(warn|low|temperature|door|reader|disabled)/.test(s)) return "med";
  return "low";
}

export default async function AlertsPage() {
  const ctx = await getCtx();
  if (!ctx.conn) redirect("/dashboard");
  if (ctx.error || !ctx.machine)
    return (
      <DashError
        title={ctx.error ? "Couldn't reach Nayax" : "No machines found"}
        message={ctx.error ?? "No machines returned for this account."}
      />
    );

  const all = await getLastAlerts(ctx.conn, ctx.machineId).catch(() => [] as Alert[]);
  const alerts = all.slice(0, SHOW);

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Alerts &amp; events</h1>
          </div>
          <span className={`status ${all.length ? "off" : "live"}`}>
            <span className="dot" />
            {all.length ? `${all.length.toLocaleString()} recent` : "All clear"}
          </span>
        </div>

        <div className="alert-list">
          {alerts.length ? (
            alerts.map((a, i) => (
              <div className={`alert-row sev-${sev(a)}`} key={i}>
                <span className="sev-dot" />
                <div className="alert-main">
                  <div className="alert-text">{alertText(a)}</div>
                  <div className="alert-meta">
                    {alertCategory(a) ? `${alertCategory(a)} · ` : ""}
                    {alertTime(a) || "—"}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No recent events — everything looks healthy.</div>
          )}
        </div>
        {all.length > SHOW ? (
          <p className="note" style={{ textAlign: "left", marginTop: 14 }}>
            Showing the {SHOW} most recent of {all.length.toLocaleString()} events
          </p>
        ) : null}
      </div>
    </section>
  );
}
