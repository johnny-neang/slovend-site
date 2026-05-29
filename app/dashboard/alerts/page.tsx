import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import {
  getLastAlerts,
  alertText,
  alertTime,
  alertSeverity,
  type Alert,
} from "@/lib/nayax";

export const metadata: Metadata = { title: "Alerts · Vendai" };
export const dynamic = "force-dynamic";

function sev(a: Alert): "high" | "med" | "low" {
  const s = alertSeverity(a).toLowerCase();
  if (/(crit|high|error|fault|3)/.test(s)) return "high";
  if (/(warn|med|2)/.test(s)) return "med";
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

  const alerts = await getLastAlerts(ctx.conn, ctx.machineId).catch(
    () => [] as Alert[],
  );

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Alerts &amp; faults</h1>
          </div>
          <span className={`status ${alerts.length ? "off" : "live"}`}>
            <span className="dot" />
            {alerts.length ? `${alerts.length} recent` : "All clear"}
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
                    {alertSeverity(a) ? `${alertSeverity(a)} · ` : ""}
                    {alertTime(a) || "—"}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No recent alerts — everything looks healthy.</div>
          )}
        </div>
      </div>
    </section>
  );
}
