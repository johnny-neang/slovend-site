import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { salesForExport, toCsv, fileSlug } from "@/lib/exports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clampRange(v: string | null): number {
  const n = Number(v);
  return [7, 30, 90].includes(n) ? n : 30;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machine || !ctx.email)
    return new Response("Connect your Nayax account first.", { status: 400 });

  const range = clampRange(new URL(req.url).searchParams.get("range"));
  const rows = await salesForExport(ctx.email, ctx.machineId, range);
  const csv = `﻿${toCsv(rows)}`; // UTF-8 BOM so Excel reads it cleanly
  const name = `vendai-${fileSlug(machineLabel(ctx.machine))}-${range}d.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
