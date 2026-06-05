import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import { ingestMachineAlerts } from "@/lib/ingest";
import { alertsSummary, type AlertFilter, type Severity } from "@/lib/alerts";
import { resolveWindow } from "@/lib/window";
import { getMachineTimezone } from "@/lib/settings";
import BarChart, { type BarDatum } from "@/components/BarChart";
import DateRangeForm from "@/components/DateRangeForm";

export const metadata: Metadata = { title: "Alerts · Vendai" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

type SP = {
  range?: string;
  from?: string;
  to?: string;
  q?: string;
  severity?: string;
  category?: string;
};

function asSeverity(v?: string): Severity | undefined {
  return v === "high" || v === "med" || v === "low" ? v : undefined;
}

/** Compose a querystring from window keys + filters, overriding/adding some keys. */
function qs(
  base: Record<string, string | undefined>,
  over: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
  return p.toString();
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const win = resolveWindow(sp);
  const filter: AlertFilter = {
    q: sp.q?.trim() || undefined,
    severity: asSeverity(sp.severity),
    category: sp.category?.trim() || undefined,
  };

  // Ingest-on-view: persist the latest live events each visit (the hourly cron is
  // the backstop; this keeps history fresh as the operator uses the dashboard).
  if (ctx.email) {
    await ingestMachineAlerts(ctx.conn, ctx.email, ctx.machineId).catch(() => 0);
  }

  const tz = ctx.email
    ? await getMachineTimezone(ctx.email, ctx.machineId)
    : "America/Los_Angeles";
  const r = ctx.email
    ? await alertsSummary(ctx.email, ctx.machineId, win, tz, filter)
    : null;

  // Active filters carried onto range tabs and export links.
  const carried = { q: filter.q, severity: filter.severity, category: filter.category };
  const winQs = {
    ...carried,
    ...(win.preset ? { range: String(win.preset) } : { from: win.fromDate, to: win.toDate }),
  };

  // Category dropdown options: those present in the window, plus the active one.
  const cats = new Set<string>(
    (r?.byCategory ?? []).map((c) => c.category).filter((c) => c && c !== "—"),
  );
  if (filter.category) cats.add(filter.category);
  const categoryOptions = [...cats].sort();

  const dayData: BarDatum[] = (r?.byDay ?? []).map((d) => ({
    label: d.label,
    value: d.n,
    tip: `${d.label} · ${d.n} event${d.n === 1 ? "" : "s"}`,
  }));
  const hasFilter = Boolean(filter.q || filter.severity || filter.category);

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Alerts &amp; events</h1>
          </div>
          <div className="report-controls">
            <div className="range-tabs">
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={`/dashboard/alerts?${qs(carried, { range: String(d) })}`}
                  className={d === win.preset ? "active" : undefined}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <DateRangeForm action="/dashboard/alerts" from={win.fromDate} to={win.toDate} />
            {r?.hasData && (
              <div className="export-actions">
                <a className="btn-export" href={`/api/export/alerts?${qs(winQs, {})}`}>
                  ↓ CSV
                </a>
                <a className="btn-export" href={`/api/export/alerts-report?${qs(winQs, {})}`}>
                  ↓ PDF
                </a>
              </div>
            )}
          </div>
        </div>

        <form className="alert-filters" method="get" action="/dashboard/alerts">
          {win.preset ? (
            <input type="hidden" name="range" value={String(win.preset)} />
          ) : (
            <>
              <input type="hidden" name="from" value={win.fromDate} />
              <input type="hidden" name="to" value={win.toDate} />
            </>
          )}
          <input
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="Search events…"
            className="alert-search"
            aria-label="Search events"
          />
          <select name="severity" defaultValue={filter.severity ?? ""} aria-label="Severity">
            <option value="">All severities</option>
            <option value="high">High</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
          <select name="category" defaultValue={filter.category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="submit" className="dr-apply">
            Filter
          </button>
          {hasFilter && (
            <Link
              className="alert-clear"
              href={`/dashboard/alerts?${qs(winQs, { q: "", severity: "", category: "" })}`}
            >
              Clear
            </Link>
          )}
        </form>

        {!r || !r.hasData ? (
          <div className="empty-state">
            <div className="seal">✦</div>
            <h2>{hasFilter ? "No matching events" : "Collecting events…"}</h2>
            <p>
              {hasFilter
                ? "No events match these filters in the selected window. Try widening the date range or clearing filters."
                : "Vendai records this machine's recent events every time you open the dashboard, plus hourly. As events accumulate they'll be searchable here by date, severity and category."}
            </p>
          </div>
        ) : (
          <>
            <div className="dash-mock" style={{ marginBottom: 20 }}>
              <div className="tiles tiles-4">
                <div className="tile">
                  <div className="l">Events · {win.short}</div>
                  <div className="n">{r.total.toLocaleString()}</div>
                  <div className="d">in range</div>
                </div>
                <div className="tile">
                  <div className="l">High severity</div>
                  <div className="n">{r.bySeverity.high.toLocaleString()}</div>
                  <div className="d">faults / errors</div>
                </div>
                <div className="tile">
                  <div className="l">Medium</div>
                  <div className="n">{r.bySeverity.med.toLocaleString()}</div>
                  <div className="d">warnings</div>
                </div>
                <div className="tile">
                  <div className="l">Low</div>
                  <div className="n">{r.bySeverity.low.toLocaleString()}</div>
                  <div className="d">informational</div>
                </div>
              </div>
            </div>

            <div className="dash-mock" style={{ marginBottom: 20 }}>
              <div className="tile chart">
                <div className="l">Events per day · {win.short}</div>
                <BarChart data={dayData} tone="dark" height={160} />
              </div>
            </div>

            <div className="alert-list">
              {r.rows.map((a, i) => (
                <div className={`alert-row sev-${a.severity}`} key={i}>
                  <span className="sev-dot" />
                  <div className="alert-main">
                    <div className="alert-text">{a.event}</div>
                    <div className="alert-meta">
                      {a.category ? `${a.category} · ` : ""}
                      {a.time || "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {r.total > r.rows.length ? (
              <p className="note" style={{ textAlign: "left", marginTop: 14 }}>
                Showing the {r.rows.length} most recent of {r.total.toLocaleString()} matching events
                — narrow the range or filters, or export the full set as CSV.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
