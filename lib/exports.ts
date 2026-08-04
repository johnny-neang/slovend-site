import "server-only";
import { dbConfigured, getSql, ensureSchema, SALE_IS_VEND } from "@/lib/db";
import { slotFromText } from "@/lib/nayax";
import { sqlTz } from "@/lib/settings";
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
  const Z = sqlTz(timezone); // whitelisted, inlined as a literal (not a bound param)
  const rows = (await sql.query(
    `select to_char(occurred_at at time zone ${Z}, 'YYYY-MM-DD HH24:MI:SS') as local_time,
            product, amount, currency, payment_method
     from sales
     where user_key = $1 and machine_id = $2 and ${SALE_IS_VEND}
       and occurred_at >= ($3::date)::timestamp at time zone ${Z}
       and occurred_at <  (($4::date + 1)::timestamp) at time zone ${Z}
     order by occurred_at desc nulls last
     limit 5000`,
    [userKey, machineId, win.fromDate, win.toDate],
  )) as {
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

/** Alerts/events CSV. Rows come from `alertsForExport` in lib/alerts.ts. */
export function alertsToCsv(
  rows: { time: string; severity: string; category: string; event: string }[],
  timezone: string,
): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [`Time (${timezone})`, "Severity", "Category", "Event"];
  const lines = rows.map((r) =>
    [r.time, r.severity, r.category, r.event].map(esc).join(","),
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
