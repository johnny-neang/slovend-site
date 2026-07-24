import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { reportSummary } from "@/lib/reports";
import { buildReportPdf } from "@/lib/pdf";
import { fileSlug } from "@/lib/exports";
import { resolveWindow } from "@/lib/window";
import { getMachineTimezone } from "@/lib/settings";

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
  const tz = await getMachineTimezone(ctx.email, ctx.machineId);
  const summary = await reportSummary(ctx.email, ctx.machineId, win, tz);
  const pdf = await buildReportPdf({
    machineName: machineLabel(ctx.machine),
    windowLabel: win.label,
    generatedAt: new Date().toISOString().slice(0, 10),
    summary,
  });
  const name = `slovend-${fileSlug(machineLabel(ctx.machine))}-${win.slug}.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
