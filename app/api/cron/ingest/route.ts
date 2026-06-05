import { listAllConnections } from "@/lib/connections";
import { listMachines } from "@/lib/nayax";
import { ingestMachine, ingestMachineAlerts, recordIngestRun } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Hourly ingestion backstop (Vercel Cron). Protected by CRON_SECRET — Vercel
// sends `Authorization: Bearer <CRON_SECRET>` automatically when the env is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const start = Date.now();
  const errors: { userKey: string; machineId?: string; message: string }[] = [];
  const conns = await listAllConnections();
  let machines = 0;
  let ingested = 0;
  for (const { userKey, conn } of conns) {
    let ms;
    try {
      ms = await listMachines(conn);
    } catch (e) {
      errors.push({ userKey, message: errMsg(e) });
      continue;
    }
    for (const m of ms.slice(0, 25)) {
      const id = String(m.MachineID ?? "");
      if (!id) continue;
      machines++;
      try {
        ingested += await ingestMachine(conn, userKey, id);
      } catch (e) {
        errors.push({ userKey, machineId: id, message: `sales: ${errMsg(e)}` });
      }
      try {
        ingested += await ingestMachineAlerts(conn, userKey, id);
      } catch (e) {
        errors.push({ userKey, machineId: id, message: `alerts: ${errMsg(e)}` });
      }
    }
  }

  await recordIngestRun({
    trigger: "cron",
    ok: errors.length === 0,
    connections: conns.length,
    machines,
    ingested,
    errors: errors.length,
    errorDetail: errors,
    durationMs: Date.now() - start,
  });

  return Response.json({
    ok: true,
    connections: conns.length,
    machines,
    ingested,
    errors: errors.length,
  });
}
