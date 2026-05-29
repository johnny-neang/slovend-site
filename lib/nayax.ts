import "server-only";
import { cookies } from "next/headers";

/**
 * Per-user Nayax Lynx connection.
 *
 * Each operator connects their OWN Lynx API token — this is NOT a global,
 * shared credential. The connection is stored in an httpOnly + secure cookie
 * scoped to that user's browser session; the token never reaches client JS and
 * is never committed or shared across users.
 *
 * (Follow-up: move to an encrypted per-user record in a database when we add one.)
 */

const COOKIE = "nayax_conn";

export type NayaxConn = { base: string; token: string; machineId: string };
export type Machine = {
  MachineID?: number;
  MachineName?: string;
  MachineNumber?: string;
  [k: string]: unknown;
};
export type Sale = Record<string, unknown>;

export async function getConnection(): Promise<NayaxConn | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NayaxConn;
    if (parsed?.base && parsed?.token) return parsed;
  } catch {
    /* malformed cookie */
  }
  return null;
}

async function lynx<T>(conn: NayaxConn, path: string): Promise<T> {
  const base = conn.base.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${conn.token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Nayax ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function listMachines(conn: NayaxConn): Promise<Machine[]> {
  const data = await lynx<unknown>(conn, "/operational/api/v1/machines");
  return Array.isArray(data) ? (data as Machine[]) : [];
}

export async function getLastSales(
  conn: NayaxConn,
  machineId: string | number,
): Promise<Sale[]> {
  const data = await lynx<unknown>(
    conn,
    `/operational/api/v1/machines/${machineId}/lastSales`,
  );
  return Array.isArray(data) ? (data as Sale[]) : [];
}

/** Best-effort numeric "amount" read across common Lynx keys. */
export function saleAmount(sale: Sale): number {
  const keys = [
    "Amount",
    "amount",
    "Price",
    "price",
    "TotalAmount",
    "PaymentAmount",
    "Sum",
    "Value",
  ];
  for (const k of keys) {
    const v = sale[k];
    const n =
      typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Best-effort product/label read. */
export function saleLabel(sale: Sale): string {
  const keys = ["ProductName", "Product", "ItemName", "Name", "Description"];
  for (const k of keys) {
    const v = sale[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "Sale";
}

/** Best-effort timestamp read. */
export function saleTime(sale: Sale): string {
  const keys = ["Time", "Date", "TransactionTime", "CreatedAt", "Timestamp"];
  for (const k of keys) {
    const v = sale[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
