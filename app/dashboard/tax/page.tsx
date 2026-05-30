import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import { getLastSales, type Sale } from "@/lib/nayax";
import { ingestSales } from "@/lib/ingest";
import { resolveWindow } from "@/lib/window";
import { getTaxSettings, saveTaxSettings, taxReport } from "@/lib/tax";
import { getMachineTimezone } from "@/lib/settings";

export const metadata: Metadata = { title: "Sales tax · Vendai" };
export const dynamic = "force-dynamic";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function saveTaxSettingsAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await getCtx();
  if (!ctx.email || !ctx.machineId) return;
  await saveTaxSettings(ctx.email, ctx.machineId, {
    ratePct: Number(formData.get("ratePct") ?? 0),
    taxablePct: Number(formData.get("taxablePct") ?? 100),
    inclusive: formData.get("inclusive") === "on",
  });
  const qs = String(formData.get("qs") ?? "");
  redirect(`/dashboard/tax${qs ? `?${qs}` : ""}`);
}

export default async function TaxPage({
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

  // Keep history fresh (same ingest-on-view used by Reports).
  if (ctx.email) {
    const sales = await getLastSales(ctx.conn, ctx.machineId).catch(() => [] as Sale[]);
    await ingestSales(ctx.email, ctx.machineId, sales).catch(() => 0);
  }

  const s = ctx.email
    ? await getTaxSettings(ctx.email, ctx.machineId)
    : { ratePct: 0, taxablePct: 100, inclusive: true };
  const tz = ctx.email
    ? await getMachineTimezone(ctx.email, ctx.machineId)
    : "America/Los_Angeles";
  const rep = ctx.email ? await taxReport(ctx.email, ctx.machineId, win, s, tz) : null;

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Sales tax</h1>
          </div>
          <div className="report-controls">
            <form className="date-range" method="get" action="/dashboard/tax">
              <input type="date" name="from" defaultValue={win.fromDate} aria-label="From date" />
              <span className="dash">–</span>
              <input type="date" name="to" defaultValue={win.toDate} aria-label="To date" />
              <button type="submit">Apply</button>
            </form>
            {rep?.hasData && (
              <div className="export-actions">
                <a className="btn-export" href={`/api/export/tax?format=csv&${win.qs}`}>
                  ↓ CSV
                </a>
                <a className="btn-export" href={`/api/export/tax?format=pdf&${win.qs}`}>
                  ↓ PDF
                </a>
              </div>
            )}
          </div>
        </div>

        <form action={saveTaxSettingsAction} className="tax-settings">
          <input type="hidden" name="qs" value={win.qs} />
          <div className="tx-field">
            <label htmlFor="ratePct">Tax rate</label>
            <div className="tx-input">
              <input
                id="ratePct"
                name="ratePct"
                type="number"
                step="0.001"
                min="0"
                max="100"
                defaultValue={s.ratePct}
              />
              <span>%</span>
            </div>
          </div>
          <div className="tx-field">
            <label htmlFor="taxablePct">Taxable share</label>
            <div className="tx-input">
              <input
                id="taxablePct"
                name="taxablePct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={s.taxablePct}
              />
              <span>%</span>
            </div>
          </div>
          <div className="tx-field">
            <span className="tx-static-label">Timezone</span>
            <span className="tx-static">{tz.replace(/_/g, " ")}</span>
          </div>
          <label className="tx-check">
            <input type="checkbox" name="inclusive" defaultChecked={s.inclusive} />
            Prices include tax
          </label>
          <button type="submit" className="tx-save">
            Save
          </button>
        </form>

        {s.ratePct <= 0 && (
          <p className="tax-hint">
            Set your combined sales-tax rate above to compute tax — it shows $0.00 until a rate is
            saved.
          </p>
        )}

        {!rep || !rep.hasData ? (
          <div className="empty-state">
            <div className="seal">✦</div>
            <h2>No sales in this range</h2>
            <p>
              Pick a different date range, or let history accrue — Vendai records this machine&apos;s
              sales each time you open the dashboard, plus once daily.
            </p>
          </div>
        ) : (
          <>
            <div className="dash-mock" style={{ marginBottom: 20 }}>
              <div className="tiles tiles-4">
                <div className="tile">
                  <div className="l">Gross sales</div>
                  <div className="n">{money(rep.gross)}</div>
                  <div className="d">{rep.txns} vends</div>
                </div>
                <div className="tile">
                  <div className="l">Taxable</div>
                  <div className="n">{money(rep.taxableReceipts)}</div>
                  <div className="d">{s.taxablePct}% of gross</div>
                </div>
                <div className="tile">
                  <div className="l">Sales tax</div>
                  <div className="n">{money(rep.tax)}</div>
                  <div className="d">
                    @ {s.ratePct}%{s.inclusive ? " incl." : ""}
                  </div>
                </div>
                <div className="tile">
                  <div className="l">Net sales</div>
                  <div className="n">{money(rep.net)}</div>
                  <div className="d">after tax</div>
                </div>
              </div>
            </div>

            <div className="table-card">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{rep.granularity === "month" ? "Month" : "Day"}</th>
                    <th className="r">Gross</th>
                    <th className="r">Taxable</th>
                    <th className="r">Tax</th>
                    <th className="r">Net</th>
                    <th className="r">Vends</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.byPeriod.map((p, i) => (
                    <tr key={i}>
                      <td className="mono">{p.period}</td>
                      <td className="r">{money(p.gross)}</td>
                      <td className="r muted">{money(p.taxable)}</td>
                      <td className="r amt">{money(p.tax)}</td>
                      <td className="r muted">{money(p.net)}</td>
                      <td className="r muted">{p.txns}</td>
                    </tr>
                  ))}
                  <tr className="tx-total">
                    <td>Total</td>
                    <td className="r">{money(rep.gross)}</td>
                    <td className="r">{money(rep.taxableReceipts)}</td>
                    <td className="r amt">{money(rep.tax)}</td>
                    <td className="r">{money(rep.net)}</td>
                    <td className="r">{rep.txns}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="note" style={{ textAlign: "left", marginTop: 14 }}>
              {rep.coveredFrom && rep.coveredTo
                ? `Based on ${rep.txns} transactions recorded from ${rep.coveredFrom} to ${rep.coveredTo} (${tz.replace(/_/g, " ")} — set on Overview). `
                : ""}
              Estimate to assist filing, based on your configured rate and taxable share. Not tax
              advice — verify with the CDTFA.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
