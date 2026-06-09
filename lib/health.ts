import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import {
  type MachineStatus,
  statusOnline,
  statusSignal,
  statusTempC,
  statusLastSeen,
} from "@/lib/nayax";

/** Don't record more than one health snapshot per machine within this window,
 * so frequent dashboard views (plus the hourly cron) yield a clean ~hourly series
 * instead of flooding the table. */
const THROTTLE_MIN = 50;

/**
 * Fire-and-forget: snapshot a machine's current health into machine_health,
 * throttled to ~hourly. No-ops without a database; never throws.
 */
export async function recordHealth(
  userKey: string,
  machineId: string,
  status: MachineStatus | null,
): Promise<void> {
  if (!dbConfigured() || !userKey || !machineId) return;
  try {
    await ensureSchema();
    const sql = getSql();
    const recent = (await sql`
      select 1 from machine_health
      where user_key = ${userKey} and machine_id = ${machineId}
        and captured_at >= now() - (${THROTTLE_MIN} || ' minutes')::interval
      limit 1
    `) as unknown[];
    if (recent.length) return; // within throttle window — skip

    const online = statusOnline(status);
    const rssi = statusSignal(status);
    const tempC = statusTempC(status);
    const lastSeen = statusLastSeen(status) || null;
    await sql`
      insert into machine_health (user_key, machine_id, online, rssi, temp_c, last_seen)
      values (${userKey}, ${machineId}, ${online}, ${rssi}, ${tempC}, ${lastSeen})
    `;
  } catch (e) {
    console.error("recordHealth failed", e);
  }
}

export type HealthSample = {
  at: string; // ISO timestamp
  rssi: number | null;
  online: boolean | null;
  tempC: number | null;
};

export type HealthTrend = {
  hasData: boolean;
  samples: HealthSample[]; // ascending by time
  latest: HealthSample | null;
};

const EMPTY: HealthTrend = { hasData: false, samples: [], latest: null };

/** Recent health samples for a machine (ascending), for the Overview trend chart. */
export async function healthTrend(
  userKey: string,
  machineId: string,
  hours = 168,
): Promise<HealthTrend> {
  if (!dbConfigured() || !userKey || !machineId) return EMPTY;
  try {
    await ensureSchema();
    const sql = getSql();
    const h = Math.max(1, Math.min(8760, Math.floor(hours)));
    const rows = (await sql`
      select to_char(captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
             rssi, online, temp_c
      from machine_health
      where user_key = ${userKey} and machine_id = ${machineId}
        and captured_at >= now() - (${h} || ' hours')::interval
      order by captured_at asc
      limit 1000
    `) as { at: string; rssi: number | null; online: boolean | null; temp_c: number | null }[];

    if (!rows.length) return EMPTY;
    const samples: HealthSample[] = rows.map((r) => ({
      at: r.at,
      rssi: r.rssi,
      online: r.online,
      tempC: r.temp_c,
    }));
    return { hasData: true, samples, latest: samples[samples.length - 1] };
  } catch (e) {
    console.error("healthTrend failed", e);
    return EMPTY;
  }
}
