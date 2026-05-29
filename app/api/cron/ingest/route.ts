import { listAllConnections } from "@/lib/connections";
import { listMachines } from "@/lib/nayax";
import { ingestMachine } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily ingestion backstop (Vercel Cron). Protected by CRON_SECRET — Vercel
// sends `Authorization: Bearer <CRON_SECRET>` automatically when the env is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const conns = await listAllConnections();
  let machines = 0;
  let ingested = 0;
  for (const { userKey, conn } of conns) {
    try {
      const ms = await listMachines(conn);
      for (const m of ms.slice(0, 25)) {
        const id = String(m.MachineID ?? "");
        if (!id) continue;
        ingested += await ingestMachine(conn, userKey, id);
        machines++;
      }
    } catch {
      /* skip this connection */
    }
  }

  return Response.json({ ok: true, connections: conns.length, machines, ingested });
}
