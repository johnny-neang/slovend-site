import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";

/** Timezones offered for a machine. Used app-wide for sales times, reports and tax. */
export const ALLOWED_TZ = [
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export const DEFAULT_TZ = "America/Los_Angeles";

export function cleanTz(tz: string | null | undefined): string {
  return tz && (ALLOWED_TZ as readonly string[]).includes(tz) ? tz : DEFAULT_TZ;
}

/** The machine's global timezone (set on the Overview). Falls back to a legacy
 * value previously stored under tax_settings, then to the default. */
export async function getMachineTimezone(userKey: string, machineId: string): Promise<string> {
  if (!dbConfigured() || !machineId) return DEFAULT_TZ;
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      select timezone from machine_settings
      where user_key = ${userKey} and machine_id = ${machineId}
    `) as { timezone: string }[];
    if (rows.length) return cleanTz(rows[0].timezone);

    // Legacy: timezone used to live on tax_settings before it became global.
    const legacy = (await sql`
      select timezone from tax_settings
      where user_key = ${userKey} and machine_id = ${machineId}
    `) as { timezone: string }[];
    if (legacy.length && legacy[0].timezone) return cleanTz(legacy[0].timezone);

    return DEFAULT_TZ;
  } catch (e) {
    console.error("getMachineTimezone failed", e);
    return DEFAULT_TZ;
  }
}

export async function saveMachineTimezone(
  userKey: string,
  machineId: string,
  tz: string,
): Promise<void> {
  if (!dbConfigured() || !machineId) return;
  await ensureSchema();
  const sql = getSql();
  const clean = cleanTz(tz);
  await sql`
    insert into machine_settings (user_key, machine_id, timezone, updated_at)
    values (${userKey}, ${machineId}, ${clean}, now())
    on conflict (user_key, machine_id) do update set
      timezone = excluded.timezone, updated_at = now()
  `;
}
