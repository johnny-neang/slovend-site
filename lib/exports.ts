import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { slotFromText } from "@/lib/nayax";

export type ExportRow = {
  occurred_at: string | null;
  slot: string;
  product: string;
  amount: number;
  currency: string;
  payment_method: string;
};

export async function salesForExport(
  userKey: string,
  machineId: string,
  days: number,
): Promise<ExportRow[]> {
  if (!dbConfigured() || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select occurred_at, product, amount, currency, payment_method
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= now() - ${`${days} days`}::interval
    order by occurred_at desc nulls last
    limit 5000
  `) as {
    occurred_at: string | Date | null;
    product: string | null;
    amount: number | null;
    currency: string | null;
    payment_method: string | null;
  }[];

  return rows.map((r) => ({
    occurred_at: r.occurred_at ? new Date(r.occurred_at).toISOString() : null,
    slot: slotFromText(r.product ?? ""),
    product: r.product ?? "",
    amount: Number(r.amount ?? 0),
    currency: r.currency ?? "",
    payment_method: r.payment_method ?? "",
  }));
}

export function toCsv(rows: ExportRow[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Time (UTC)", "Slot", "Product", "Amount", "Currency", "Payment"];
  const lines = rows.map((r) =>
    [r.occurred_at ?? "", r.slot, r.product, r.amount.toFixed(2), r.currency, r.payment_method]
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
