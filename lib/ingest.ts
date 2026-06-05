import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import {
  type Sale,
  type NayaxConn,
  getLastSales,
  saleAmount,
  saleLabel,
  salePayment,
  saleCurrency,
  saleTxnId,
  saleOccurredAtGMT,
} from "@/lib/nayax";

/** Treat a Lynx GMT timestamp (often missing the 'Z') as UTC and normalize to ISO. */
function toUtcIso(s: string): string | null {
  if (!s) return null;
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Persist sales into Neon, deduped by (user, machine, txn). Idempotent — safe to
 * call on every dashboard view and from the cron. Returns the count of NEW rows.
 */
export async function ingestSales(
  userKey: string,
  machineId: string,
  sales: Sale[],
): Promise<number> {
  if (!dbConfigured() || !machineId || !sales.length) return 0;
  await ensureSchema();
  const sql = getSql();

  const seen = new Set<string>();
  const rows = sales
    .slice(0, 500)
    .map((s) => ({
      txn: saleTxnId(s),
      product: saleLabel(s),
      amount: saleAmount(s),
      currency: saleCurrency(s),
      payment: salePayment(s) || null,
      occurred: toUtcIso(saleOccurredAtGMT(s)),
    }))
    .filter((r) => {
      if (!r.txn || seen.has(r.txn)) return false;
      seen.add(r.txn);
      return true;
    });
  if (!rows.length) return 0;

  const cols = 8;
  const params: unknown[] = [];
  const tuples = rows
    .map((r, i) => {
      const b = i * cols;
      params.push(
        userKey,
        machineId,
        r.txn,
        r.product,
        r.amount,
        r.currency,
        r.payment,
        r.occurred,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
    })
    .join(",");

  const text =
    `insert into sales (user_key, machine_id, txn_id, product, amount, currency, payment_method, occurred_at) ` +
    `values ${tuples} on conflict (user_key, machine_id, txn_id) do nothing returning txn_id`;

  const inserted = (await sql.query(text, params)) as unknown[];
  return Array.isArray(inserted) ? inserted.length : 0;
}

/**
 * Fetch + persist recent sales for one machine (used by the cron). Throws on a
 * Nayax/DB failure so the caller can record it — callers must wrap in try/catch.
 */
export async function ingestMachine(
  conn: NayaxConn,
  userKey: string,
  machineId: string,
): Promise<number> {
  const sales = await getLastSales(conn, machineId);
  return await ingestSales(userKey, machineId, sales);
}

/** One row written to ingest_runs per cron execution. */
export type IngestRun = {
  trigger?: string;
  ok: boolean;
  connections: number;
  machines: number;
  ingested: number;
  errors: number;
  errorDetail: { userKey: string; machineId?: string; message: string }[];
  durationMs: number;
};

/**
 * Fire-and-forget: persist a summary of one ingest run so cron activity and
 * failures are auditable. No-ops without a database; never throws.
 */
export async function recordIngestRun(run: IngestRun): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await ensureSchema();
    const sql = getSql();
    await sql`
      insert into ingest_runs
        (trigger, ok, connections, machines, ingested, errors, error_detail, duration_ms)
      values (
        ${run.trigger ?? "cron"}, ${run.ok}, ${run.connections}, ${run.machines},
        ${run.ingested}, ${run.errors}, ${JSON.stringify(run.errorDetail)}::jsonb,
        ${run.durationMs}
      )
    `;
  } catch (e) {
    console.error("recordIngestRun failed", e);
  }
}
