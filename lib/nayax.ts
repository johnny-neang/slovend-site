import "server-only";

/**
 * Nayax Lynx API client. Stateless: every call takes the caller's connection
 * (base URL + token). Storage of that connection lives in lib/connections.ts.
 */

export type NayaxConn = { base: string; token: string; machineId: string };
export type Machine = {
  MachineID?: number;
  MachineName?: string;
  MachineNumber?: string;
  [k: string]: unknown;
};
export type Sale = Record<string, unknown>;

async function lynx<T>(conn: NayaxConn, path: string): Promise<T> {
  const base = conn.base.replace(/\/$/, "");
  const url = `${base}${path}`;

  // Standard Bearer auth; fall back to the raw token if the API rejects it.
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${conn.token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    res = await fetch(url, {
      headers: { Authorization: conn.token, accept: "application/json" },
      cache: "no-store",
    });
  }

  if (!res.ok) {
    throw new Error(`Nayax ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function listMachines(conn: NayaxConn): Promise<Machine[]> {
  const data = await lynx<unknown>(conn, "/operational/v1/machines");
  return Array.isArray(data) ? (data as Machine[]) : [];
}

export async function getLastSales(
  conn: NayaxConn,
  machineId: string | number,
): Promise<Sale[]> {
  const data = await lynx<unknown>(
    conn,
    `/operational/v1/machines/${machineId}/lastSales`,
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
