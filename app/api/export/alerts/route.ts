import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { alertsForExport, type AlertFilter, type Severity } from "@/lib/alerts";
import { alertsToCsv, fileSlug } from "@/lib/exports";
import { resolveWindow } from "@/lib/window";
import { getMachineTimezone } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function filterFrom(sp: URLSearchParams): AlertFilter {
  const sev = sp.get("severity");
  return {
    q: sp.get("q") ?? undefined,
    severity:
      sev === "high" || sev === "med" || sev === "low" ? (sev as Severity) : undefined,
    category: sp.get("category") ?? undefined,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machine || !ctx.email)
    return new Response("Connect your Nayax account first.", { status: 400 });

  const sp = new URL(req.url).searchParams;
  const win = resolveWindow({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  const tz = await getMachineTimezone(ctx.email, ctx.machineId);
  const rows = await alertsForExport(ctx.email, ctx.machineId, win, tz, filterFrom(sp));
  const csv = `﻿${alertsToCsv(rows, tz)}`; // UTF-8 BOM so Excel reads it cleanly
  const name = `slovend-alerts-${fileSlug(machineLabel(ctx.machine))}-${win.slug}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
