import "server-only";

/**
 * Nayax Lynx API client. Stateless: every call takes the caller's connection
 * (base URL + token). Storage of that connection lives in lib/connections.ts.
 *
 * Endpoints (relative to conn.base, e.g. https://lynx.nayax.com):
 *   GET /operational/v1/machines
 *   GET /operational/v1/machines/{id}
 *   GET /operational/v1/machines/{id}/lastSales
 *   GET /operational/v1/machines/{id}/lastAlerts
 *   GET /operational/v1/machines/{id}/machineProducts
 *   GET /operational/v1/machines/{id}/status
 *
 * Lynx field names vary, so reads go through defensive `pick*` helpers.
 */

export type NayaxConn = { base: string; token: string; machineId: string };
export type Machine = {
  MachineID?: number;
  MachineName?: string;
  MachineNumber?: string;
  [k: string]: unknown;
};
export type Sale = Record<string, unknown>;
export type Alert = Record<string, unknown>;
export type Product = Record<string, unknown>;
export type MachineStatus = Record<string, unknown>;

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

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  // Some Lynx endpoints wrap the list, e.g. { Data: [...] } / { items: [...] }.
  if (data && typeof data === "object") {
    for (const k of ["Data", "data", "items", "Items", "Result", "results"]) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

/* ----------------------------- endpoints ----------------------------- */

export async function listMachines(conn: NayaxConn): Promise<Machine[]> {
  return asArray<Machine>(await lynx<unknown>(conn, "/operational/v1/machines"));
}

export async function getMachine(
  conn: NayaxConn,
  machineId: string | number,
): Promise<Machine | null> {
  try {
    const data = await lynx<unknown>(conn, `/operational/v1/machines/${machineId}`);
    if (Array.isArray(data)) return (data[0] as Machine) ?? null;
    return (data as Machine) ?? null;
  } catch {
    return null;
  }
}

export async function getLastSales(
  conn: NayaxConn,
  machineId: string | number,
): Promise<Sale[]> {
  return asArray<Sale>(
    await lynx<unknown>(conn, `/operational/v1/machines/${machineId}/lastSales`),
  );
}

export async function getLastAlerts(
  conn: NayaxConn,
  machineId: string | number,
): Promise<Alert[]> {
  return asArray<Alert>(
    await lynx<unknown>(conn, `/operational/v1/machines/${machineId}/lastAlerts`),
  );
}

export async function getMachineProducts(
  conn: NayaxConn,
  machineId: string | number,
): Promise<Product[]> {
  return asArray<Product>(
    await lynx<unknown>(
      conn,
      `/operational/v1/machines/${machineId}/machineProducts`,
    ),
  );
}

export async function getMachineStatus(
  conn: NayaxConn,
  machineId: string | number,
): Promise<MachineStatus | null> {
  try {
    const data = await lynx<unknown>(
      conn,
      `/operational/v1/machines/${machineId}/status`,
    );
    if (Array.isArray(data)) return (data[0] as MachineStatus) ?? null;
    return (data as MachineStatus) ?? null;
  } catch {
    return null;
  }
}

/* -------------------------- defensive readers -------------------------- */

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}
function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}
function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = num(o[k]);
    if (n !== null) return n;
  }
  return null;
}
function pickBool(o: Record<string, unknown>, keys: string[]): boolean | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["true", "1", "online", "connected", "active", "ok"].includes(s)) return true;
      if (["false", "0", "offline", "disconnected", "inactive"].includes(s)) return false;
    }
  }
  return null;
}

/* sales */
export function saleAmount(s: Sale): number {
  return (
    pickNum(s, [
      "Amount",
      "amount",
      "Price",
      "price",
      "TotalAmount",
      "PaymentAmount",
      "Sum",
      "Value",
    ]) ?? 0
  );
}
export function saleLabel(s: Sale): string {
  return pickStr(s, ["ProductName", "Product", "ItemName", "Name", "Description"]) || "Sale";
}
export function saleTime(s: Sale): string {
  return pickStr(s, [
    "Time",
    "Date",
    "TransactionTime",
    "CreatedAt",
    "Timestamp",
    "PaymentDateTime",
    "SettlementTime",
  ]);
}
export function salePayment(s: Sale): string {
  return pickStr(s, [
    "PaymentMethod",
    "PaymentMethodName",
    "PaymentType",
    "Payment",
    "CardType",
  ]);
}
export function saleTxnId(s: Sale): string {
  return pickStr(s, [
    "TransactionID",
    "TransactionId",
    "TransID",
    "TransactionNumber",
    "SettlementID",
    "Id",
    "ID",
  ]);
}

/* alerts */
export function alertText(a: Alert): string {
  return (
    pickStr(a, [
      "AlertText",
      "Description",
      "Message",
      "AlertName",
      "Name",
      "Text",
      "Title",
    ]) || "Alert"
  );
}
export function alertTime(a: Alert): string {
  return pickStr(a, ["AlertTime", "Time", "Date", "CreatedAt", "Timestamp"]);
}
export function alertSeverity(a: Alert): string {
  return pickStr(a, ["Severity", "Level", "Priority", "AlertLevel", "Type"]);
}

/* products / planogram */
export function productName(p: Product): string {
  return pickStr(p, ["ProductName", "Product", "Name", "ItemName", "Description"]) || "—";
}
export function productBay(p: Product): string {
  return pickStr(p, ["MDBCode", "Selection", "Bay", "Code", "Column", "Position", "Slot"]);
}
export function productStock(p: Product): number | null {
  return pickNum(p, ["CurrentQuantity", "Quantity", "Stock", "CurrentStock", "Count", "Remaining"]);
}
export function productCapacity(p: Product): number | null {
  return pickNum(p, ["Capacity", "MaxCapacity", "ParLevel", "Max", "FullCapacity"]);
}
export function productThreshold(p: Product): number | null {
  return pickNum(p, ["VendOutAlertThreshold", "MinThreshold", "AlertThreshold", "ReorderLevel"]);
}
export function productPrice(p: Product): number | null {
  return pickNum(p, ["Price", "ProductPrice", "Amount", "UnitPrice"]);
}
export function productLowStock(p: Product): boolean {
  const stock = productStock(p);
  if (stock === null) return false;
  const threshold = productThreshold(p);
  if (threshold !== null) return stock <= threshold;
  const cap = productCapacity(p);
  if (cap !== null && cap > 0) return stock <= Math.max(1, Math.ceil(cap * 0.2));
  return stock <= 2;
}

/* status */
export function statusOnline(s: MachineStatus | null): boolean | null {
  if (!s) return null;
  return pickBool(s, ["Online", "IsOnline", "Connected", "IsConnected", "Status", "ConnectivityStatus"]);
}
export function statusLastSeen(s: MachineStatus | null): string {
  if (!s) return "";
  return pickStr(s, ["LastSeen", "LastHeartbeat", "LastConnection", "LastCommunication", "LastSeenTime", "HeartbeatTime"]);
}
export function statusFirmware(s: MachineStatus | null): string {
  if (!s) return "";
  return pickStr(s, ["FirmwareVersion", "Firmware", "Version", "SoftwareVersion"]);
}
