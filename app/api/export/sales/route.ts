import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { salesForExport, toCsv, fileSlug } from "@/lib/exports";
import { resolveWindow } from "@/lib/window";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machine || !ctx.email)
    return new Response("Connect your Nayax account first.", { status: 400 });

  const sp = new URL(req.url).searchParams;
  const win = resolveWindow({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  const rows = await salesForExport(ctx.email, ctx.machineId, win);
  const csv = `﻿${toCsv(rows)}`; // UTF-8 BOM so Excel reads it cleanly
  const name = `vendai-${fileSlug(machineLabel(ctx.machine))}-${win.slug}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
