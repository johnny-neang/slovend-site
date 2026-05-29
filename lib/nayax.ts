import "server-only";

/**
 * Server-only Nayax Lynx API client. The token never reaches the browser.
 * Configure via env: NAYAX_API_BASE, NAYAX_API_TOKEN, NAYAX_MACHINE_ID.
 *
 * NOTE: Exact Lynx response field names are confirmed against the live API once
 * a token is configured; the helpers below read defensively so the dashboard
 * never crashes on a shape mismatch.
 */

const BASE = (process.env.NAYAX_API_BASE ?? "").replace(/\/$/, "");
const TOKEN = process.env.NAYAX_API_TOKEN ?? "";

export function nayaxConfigured(): boolean {
  return Boolean(BASE && TOKEN);
}

export function defaultMachineId(): string {
  return process.env.NAYAX_MACHINE_ID ?? "";
}

async function lynx<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Nayax ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export type Machine = {
  MachineID?: number;
  MachineName?: string;
  MachineNumber?: string;
  [k: string]: unknown;
};

export type Sale = Record<string, unknown>;

export async function listMachines(): Promise<Machine[]> {
  const data = await lynx<unknown>("/operational/api/v1/machines");
  return Array.isArray(data) ? (data as Machine[]) : [];
}

export async function getLastSales(machineId: string | number): Promise<Sale[]> {
  const data = await lynx<unknown>(
    `/operational/api/v1/machines/${machineId}/lastSales`,
  );
  return Array.isArray(data) ? (data as Sale[]) : [];
}

export async function getMachine(machineId: string | number): Promise<Machine | null> {
  try {
    const list = await listMachines();
    const idNum = Number(machineId);
    return (
      list.find((m) => Number(m.MachineID) === idNum) ?? list[0] ?? null
    );
  } catch {
    return null;
  }
}

/** Best-effort read of a numeric "amount" from a sale record across common keys. */
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
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Best-effort read of a product/label from a sale record. */
export function saleLabel(sale: Sale): string {
  const keys = ["ProductName", "Product", "ItemName", "Name", "Description"];
  for (const k of keys) {
    const v = sale[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "Sale";
}

/** Best-effort read of a timestamp from a sale record. */
export function saleTime(sale: Sale): string {
  const keys = ["Time", "Date", "TransactionTime", "CreatedAt", "Timestamp"];
  for (const k of keys) {
    const v = sale[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
