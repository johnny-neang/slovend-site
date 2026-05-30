import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { slotFromText } from "@/lib/nayax";
import { cleanTz } from "@/lib/settings";
import type { Win } from "@/lib/window";

export type ExportRow = {
  time: string; // local wall-clock "YYYY-MM-DD HH:MM:SS" in the machine timezone
  slot: string;
  product: string;
  amount: number;
  currency: string;
  payment_method: string;
};

export async function salesForExport(
  userKey: string,
  machineId: string,
  win: Win,
  timezone: string,
): Promise<ExportRow[]> {
  if (!dbConfigured() || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const tz = cleanTz(timezone);
  const rows = (await sql`
    select to_char(occurred_at at time zone ${tz}::text, 'YYYY-MM-DD HH24:MI:SS') as local_time,
           product, amount, currency, payment_method
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= (${win.fromDate}::date)::timestamp at time zone ${tz}::text
      and occurred_at <  ((${win.toDate}::date + 1)::timestamp) at time zone ${tz}::text
    order by occurred_at desc nulls last
    limit 5000
  `) as {
    local_time: string | null;
    product: string | null;
    amount: number | null;
    currency: string | null;
    payment_method: string | null;
  }[];

  return rows.map((r) => ({
    time: r.local_time ?? "",
    slot: slotFromText(r.product ?? ""),
    product: r.product ?? "",
    amount: Number(r.amount ?? 0),
    currency: r.currency ?? "",
    payment_method: r.payment_method ?? "",
  }));
}

export function toCsv(rows: ExportRow[], timezone: string): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [`Time (${timezone})`, "Slot", "Product", "Amount", "Currency", "Payment"];
  const lines = rows.map((r) =>
    [r.time, r.slot, r.product, r.amount.toFixed(2), r.currency, r.payment_method]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function fileSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "machine"
  );
}
