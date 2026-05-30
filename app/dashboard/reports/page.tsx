import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import { getLastSales, type Sale } from "@/lib/nayax";
import { ingestSales } from "@/lib/ingest";
import { reportSummary } from "@/lib/reports";
import { resolveWindow } from "@/lib/window";
import { getMachineTimezone } from "@/lib/settings";
import BarChart, { type BarDatum } from "@/components/BarChart";
import DateRangeForm from "@/components/DateRangeForm";

export const metadata: Metadata = { title: "Reports · Vendai" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hourShort(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}
function hourLong(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
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

  // Ingest-on-view: capture the latest recent sales every time Reports is opened
  // (Hobby plan only allows a daily cron, so this keeps history fresh as you use it).
  if (ctx.email) {
    const sales = await getLastSales(ctx.conn, ctx.machineId).catch(() => [] as Sale[]);
    await ingestSales(ctx.email, ctx.machineId, sales).catch(() => 0);
  }

  const tz = ctx.email
    ? await getMachineTimezone(ctx.email, ctx.machineId)
    : "America/Los_Angeles";
  const r = ctx.email ? await reportSummary(ctx.email, ctx.machineId, win, tz) : null;
  const hourMap = new Map((r?.hours ?? []).map((h) => [h.hr, h.n]));
  const busiest =
    r && r.byDay.length
      ? r.byDay.reduce((a, b) => (b.revenue > a.revenue ? b : a)).label
      : "—";
  const dayData: BarDatum[] = (r?.byDay ?? []).map((d) => ({
    label: d.label,
    value: d.revenue,
    tip: `${d.label} · ${money(d.revenue)} · ${d.vends} vend${d.vends === 1 ? "" : "s"}`,
  }));
  const hourData: BarDatum[] = Array.from({ length: 24 }, (_, h) => {
    const n = hourMap.get(h) ?? 0;
    return {
      label: hourShort(h),
      value: n,
      tip: `${hourLong(h)} · ${n} vend${n === 1 ? "" : "s"}`,
    };
  });

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Reports</h1>
          </div>
          <div className="report-controls">
            <div className="range-tabs">
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={`/dashboard/reports?range=${d}`}
                  className={d === win.preset ? "active" : undefined}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <DateRangeForm action="/dashboard/reports" from={win.fromDate} to={win.toDate} />
            {r?.hasData && (
              <div className="export-actions">
                <a className="btn-export" href={`/api/export/sales?${win.qs}`}>
                  ↓ CSV
                </a>
                <a className="btn-export" href={`/api/export/report?${win.qs}`}>
                  ↓ PDF
                </a>
              </div>
            )}
          </div>
        </div>

        {!r || !r.hasData ? (
          <div className="empty-state">
            <div className="seal">✦</div>
            <h2>Collecting data…</h2>
            <p>
              Vendai records this machine&apos;s recent sales every time you open
              the dashboard, plus once daily. As transactions accumulate, revenue
              trends, top sellers and peak hours will appear here. Check back soon.
            </p>
          </div>
        ) : (
          <>
            <div className="dash-mock" style={{ marginBottom: 20 }}>
              <div className="tiles tiles-4">
                <div className="tile">
                  <div className="l">Revenue · {win.short}</div>
                  <div className="n">{money(r.revenue)}</div>
                  <div className="d">{r.activeDays} active days</div>
                </div>
                <div className="tile">
                  <div className="l">Vends · {win.short}</div>
                  <div className="n">{r.vends}</div>
                  <div className="d">transactions</div>
                </div>
                <div className="tile">
                  <div className="l">Avg sale</div>
                  <div className="n">{r.vends ? money(r.revenue / r.vends) : "—"}</div>
                  <div className="d">per vend</div>
                </div>
                <div className="tile">
                  <div className="l">Busiest day</div>
                  <div className="n" style={{ fontSize: 22 }}>
                    {busiest}
                  </div>
                  <div className="d">by revenue</div>
                </div>
              </div>
            </div>

            <div className="dash-mock" style={{ marginBottom: 20 }}>
              <div className="tile chart">
                <div className="l">Daily revenue · {win.short}</div>
                <BarChart data={dayData} tone="dark" height={160} />
              </div>
            </div>

            <div className="panel-grid">
              <div className="panel">
                <div className="panel-h">Top products · {win.short}</div>
                <div className="rlist">
                  {r.topProducts.map((p, i) => (
                    <div className="rrow" key={i}>
                      <span className="rp">{p.product}</span>
                      <span className="rv">
                        {p.vends} · {money(p.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-h">Payment mix · {win.short}</div>
                <div className="bars-h">
                  {r.payMix.map((p) => (
                    <div className="bar-h" key={p.method}>
                      <span className="bk">{p.method}</span>
                      <span className="bv">
                        <span style={{ width: `${Math.round((p.n / r.vends) * 100)}%` }} />
                      </span>
                      <span className="bn">{p.n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 20 }}>
              <div className="panel-h">Sales by hour of day · {tz.replace(/_/g, " ")}</div>
              <BarChart data={hourData} tone="light" height={150} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
