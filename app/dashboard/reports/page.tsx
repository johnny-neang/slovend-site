import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import { getLastSales, type Sale } from "@/lib/nayax";
import { ingestSales } from "@/lib/ingest";
import { reportSummary } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports · Vendai" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
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
  const range = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 30;

  // Ingest-on-view: capture the latest recent sales every time Reports is opened
  // (Hobby plan only allows a daily cron, so this keeps history fresh as you use it).
  if (ctx.email) {
    const sales = await getLastSales(ctx.conn, ctx.machineId).catch(() => [] as Sale[]);
    await ingestSales(ctx.email, ctx.machineId, sales).catch(() => 0);
  }

  const r = ctx.email ? await reportSummary(ctx.email, ctx.machineId, range) : null;
  const maxRev = Math.max(1, ...(r?.byDay.map((d) => d.revenue) ?? [1]));
  const maxHr = Math.max(1, ...(r?.hours.map((h) => h.n) ?? [1]));
  const hourMap = new Map((r?.hours ?? []).map((h) => [h.hr, h.n]));
  const busiest =
    r && r.byDay.length
      ? r.byDay.reduce((a, b) => (b.revenue > a.revenue ? b : a)).day
      : "—";

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
                  className={d === range ? "active" : undefined}
                >
                  {d}d
                </Link>
              ))}
            </div>
            {r?.hasData && (
              <div className="export-actions">
                <a className="btn-export" href={`/api/export/sales?range=${range}`}>
                  ↓ CSV
                </a>
                <a className="btn-export" href={`/api/export/report?range=${range}`}>
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
                  <div className="l">Revenue · {range}d</div>
                  <div className="n">{money(r.revenue)}</div>
                  <div className="d">{r.activeDays} active days</div>
                </div>
                <div className="tile">
                  <div className="l">Vends · {range}d</div>
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
                <div className="l">Daily revenue</div>
                <div className="bars">
                  {r.byDay.map((d, i) => (
                    <i
                      key={i}
                      className={d.revenue === maxRev ? "hi" : undefined}
                      style={{ height: `${Math.max(4, Math.round((d.revenue / maxRev) * 100))}%` }}
                      title={`${d.day}: ${money(d.revenue)}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="panel-grid">
              <div className="panel">
                <div className="panel-h">Top products · {range}d</div>
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
                <div className="panel-h">Payment mix · {range}d</div>
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
              <div className="panel-h">Sales by hour of day</div>
              <div className="hour-grid">
                {Array.from({ length: 24 }, (_, h) => {
                  const n = hourMap.get(h) ?? 0;
                  return (
                    <div className="hcol" key={h} title={`${h}:00 — ${n} vends`}>
                      <span
                        className="hbar"
                        style={{ height: `${Math.max(3, Math.round((n / maxHr) * 100))}%` }}
                      />
                      <span className="hl">{h % 6 === 0 ? h : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
