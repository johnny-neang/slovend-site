import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { fileSlug } from "@/lib/exports";
import { resolveWindow } from "@/lib/window";
import { getTaxSettings, taxReport } from "@/lib/tax";
import { buildTaxPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machine || !ctx.email)
    return new Response("Connect your Nayax account first.", { status: 400 });

  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";
  const win = resolveWindow({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  const settings = await getTaxSettings(ctx.email, ctx.machineId);
  const rep = await taxReport(ctx.email, ctx.machineId, win, settings);
  const machine = machineLabel(ctx.machine);
  const base = `vendai-tax-${fileSlug(machine)}-${win.slug}`;

  if (format === "pdf") {
    const pdf = await buildTaxPdf({
      machineName: machine,
      windowLabel: win.label,
      generatedAt: new Date().toISOString().slice(0, 10),
      timezone: settings.timezone,
      ratePct: settings.ratePct,
      taxablePct: settings.taxablePct,
      inclusive: settings.inclusive,
      gross: rep.gross,
      taxableReceipts: rep.taxableReceipts,
      tax: rep.tax,
      net: rep.net,
      txns: rep.txns,
      coveredFrom: rep.coveredFrom,
      coveredTo: rep.coveredTo,
      byPeriod: rep.byPeriod.map((p) => ({
        period: p.period,
        gross: p.gross,
        tax: p.tax,
        net: p.net,
        txns: p.txns,
      })),
    });
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const f2 = (n: number) => n.toFixed(2);
  const lines: string[] = [];
  lines.push(`Vendai Sales Tax Summary — ${machine}`);
  lines.push(`Window:,${csvCell(win.label)}`);
  lines.push(`Timezone:,${settings.timezone}`);
  lines.push(
    `Basis:,${csvCell(`rate ${settings.ratePct}% · ${settings.taxablePct}% taxable · ${settings.inclusive ? "tax-inclusive" : "tax-exclusive"}`)}`,
  );
  lines.push("");
  lines.push(["Period", "Gross", "Taxable", "Tax", "Net", "Txns"].join(","));
  for (const p of rep.byPeriod) {
    lines.push([csvCell(p.period), f2(p.gross), f2(p.taxable), f2(p.tax), f2(p.net), p.txns].join(","));
  }
  lines.push(
    ["TOTAL", f2(rep.gross), f2(rep.taxableReceipts), f2(rep.tax), f2(rep.net), rep.txns].join(","),
  );
  const csv = `﻿${lines.join("\n")}`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
