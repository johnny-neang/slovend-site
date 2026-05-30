import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { reportSummary } from "@/lib/reports";
import { buildReportPdf } from "@/lib/pdf";
import { fileSlug } from "@/lib/exports";

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
  const summary = await reportSummary(ctx.email, ctx.machineId, range);
  const pdf = await buildReportPdf({
    machineName: machineLabel(ctx.machine),
    rangeDays: range,
    generatedAt: new Date().toISOString().slice(0, 10),
    summary,
  });
  const name = `vendai-${fileSlug(machineLabel(ctx.machine))}-${range}d.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
