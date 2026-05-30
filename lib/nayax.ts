import "server-only";

/**
 * Nayax Lynx API client. Stateless: every call takes the caller's connection
 * (base URL + token). Storage of that connection lives in lib/connections.ts.
 *
 * Endpoints (relative to conn.base, e.g. https://lynx.nayax.com):
 *   GET /operational/v1/machines
 *   GET /operational/v1/machines/{id}
 *   GET /operational/v1/machines/{id}/lastSales
 *   GET /operational/v1/machines/{id}/lastAlerts   (returns the full event log)
 *   GET /operational/v1/machines/{id}/machineProducts
 *   GET /operational/v1/machines/{id}/status
 *
 * Field names below are taken from real Lynx responses.
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
  if (!res.ok) throw new Error(`Nayax ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
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
    if (typeof v === "string" && v.trim()) return v.trim();
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

/* sales — SettlementValue is the charged amount; AuthorizationValue is a
   card pre-auth and must NOT be used as revenue except as a last resort. */
export function saleAmount(s: Sale): number {
  return (
    pickNum(s, [
      "SettlementValue",
      "Amount",
      "amount",
      "Price",
      "TotalAmount",
      "PaymentAmount",
      "Sum",
      "Value",
      "AuthorizationValue",
    ]) ?? 0
  );
}
export function saleLabel(s: Sale): string {
  return pickStr(s, ["ProductName", "Product", "ItemName", "Name", "Description"]) || "Sale";
}
export function saleTime(s: Sale): string {
  return pickStr(s, [
    "MachineAuthorizationTime",
    "AuthorizationDateTimeGMT",
    "SettlementDateTimeGMT",
    "TransactionTime",
    "Time",
    "Date",
    "Timestamp",
  ]);
}
export function salePayment(s: Sale): string {
  return pickStr(s, ["PaymentMethod", "RecognitionMethod", "CardBrand", "PaymentType", "CardType"]);
}
export function saleCurrency(s: Sale): string {
  return pickStr(s, ["CurrencyCode", "Currency"]) || "USD";
}
export function saleTxnId(s: Sale): string {
  return pickStr(s, [
    "TransactionID",
    "TransactionId",
    "PaymentServiceTransactionID",
    "TransID",
    "Id",
    "ID",
  ]);
}
/** Vending slot for a sale. Lynx embeds the MDB code either in a field or in the
 * ProductName (e.g. "Unknown(1028 = 1.00)"); decode it like productSlot. */
export function saleSlot(s: Sale): string {
  let code = pickNum(s, ["MDBCode", "MDB", "SelectionCode", "Selection"]);
  if (code === null) {
    const m = pickStr(s, ["ProductName"]).match(/\((-?\d+)\s*=/);
    if (m) code = parseInt(m[1], 10);
  }
  if (code === null || code <= 0) return "—";
  const row = code >> 8;
  const col = code & 0xff;
  return `${row}${String(col).padStart(2, "0")}`;
}

/** Decode a slot from a stored product string like "Unknown(1028 = 1.00)". */
export function slotFromText(text: string): string {
  const m = (text || "").match(/\((-?\d+)\s*=/);
  if (!m) return "—";
  const code = parseInt(m[1], 10);
  if (!Number.isFinite(code) || code <= 0) return "—";
  return `${code >> 8}${String(code & 0xff).padStart(2, "0")}`;
}

/** Readable local date+time for a sale, converted from the GMT timestamp into `tz`.
 * e.g. "May 29, 2026, 2:29 PM". Falls back to the raw string if unparseable. */
export function saleLocalTime(s: Sale, tz: string): string {
  const raw = saleOccurredAtGMT(s);
  if (!raw) return "—";
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(raw);
  const d = new Date(hasTz ? raw : `${raw}Z`);
  if (Number.isNaN(d.getTime())) return raw;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  };
  try {
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  } catch {
    delete opts.timeZone;
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  }
}

/** GMT timestamp string for storage/aggregation (vs saleTime which prefers local for display). */
export function saleOccurredAtGMT(s: Sale): string {
  return pickStr(s, [
    "AuthorizationDateTimeGMT",
    "SettlementDateTimeGMT",
    "MachineAuthorizationTime",
    "TransactionTime",
    "Time",
    "Date",
  ]);
}

/* alerts (Lynx event log) */
export function alertText(a: Alert): string {
  return (
    pickStr(a, ["EventDescription", "AlertText", "Description", "Message", "EventGroupName", "Name"]) ||
    "Event"
  );
}
export function alertTime(a: Alert): string {
  return pickStr(a, ["EventDateTimeVMC", "EventDateTimeGMT", "AlertTime", "Time", "Date", "Timestamp"]);
}
export function alertCategory(a: Alert): string {
  return pickStr(a, ["EventCategoryName", "EventGroupName", "Severity", "Level", "Type"]);
}

/* products / planogram */
export function productName(p: Product): string {
  return pickStr(p, ["DEXProductName", "ProductName", "Product", "Name", "ItemName", "Description"]);
}
export function productBay(p: Product): string {
  return pickStr(p, ["MDBCode", "Selection", "Bay", "Code", "Column", "Position", "Slot", "PACode"]);
}
/**
 * Human selection/slot from the Lynx MDBCode, which packs row in the high byte
 * and column in the low byte. The slot is the row followed by the column
 * zero-padded to two digits, e.g. 1032 = 0x0408 -> row 4, col 8 -> "408".
 * MDBCode 0 -> "—". Falls back to an explicit selection field if no MDBCode.
 */
export function productSlot(p: Product): string {
  const code = pickNum(p, ["MDBCode"]);
  if (code !== null && code > 0) {
    const row = code >> 8; // high byte
    const col = code & 0xff; // low byte
    return `${row}${String(col).padStart(2, "0")}`;
  }
  if (code === 0) return "—";
  return pickStr(p, ["PACode", "Selection", "Slot", "OperatorButtonCode"]);
}
export function productStock(p: Product): number | null {
  return pickNum(p, ["CurrentQuantity", "Quantity", "Stock", "CurrentStock", "Count", "Remaining"]);
}
export function productPar(p: Product): number | null {
  return pickNum(p, ["PAR", "Capacity", "MaxCapacity", "ParLevel", "Max", "FullCapacity"]);
}
export function productThreshold(p: Product): number | null {
  return pickNum(p, ["VendOutAlertThreshold", "MinThreshold", "AlertThreshold", "ReorderLevel"]);
}
export function productPrice(p: Product): number | null {
  return pickNum(p, ["MachinePrice", "CashPrice", "CreditCardPrice", "RetailPrice", "Price", "ProductPrice", "UnitPrice"]);
}
export function productMissing(p: Product): number | null {
  return pickNum(p, ["MissingStockByMDB", "MissingStockByDEX"]);
}
export function productVendedOut(p: Product): boolean {
  return pickBool(p, ["SelectionVendOutBit", "VendOut", "SoldOut"]) === true;
}
export function productLowStock(p: Product): boolean {
  if (productVendedOut(p)) return true;
  const stock = productStock(p);
  const threshold = productThreshold(p);
  if (stock !== null && threshold !== null) return stock <= threshold;
  const par = productPar(p);
  if (stock !== null && par !== null && par > 0) return stock <= Math.max(1, Math.ceil(par * 0.2));
  return false;
}

/* status */
export function statusOnline(s: MachineStatus | null): boolean | null {
  if (!s) return null;
  return pickBool(s, ["MachineMQTTStatus", "Online", "IsOnline", "Connected", "IsConnected"]);
}
export function statusLastSeen(s: MachineStatus | null): string {
  if (!s) return "";
  return pickStr(s, [
    "LastKeepAliveDateTime",
    "LastTransactionDateTime",
    "MachineStatusUpdateDateTime",
    "LastDEXReadDateTime",
    "LastSeen",
  ]);
}
export function statusSignal(s: MachineStatus | null): number | null {
  if (!s) return null;
  return pickNum(s, ["LastReceptionLevel(RSSI)", "RSSI", "SignalStrength", "ReceptionLevel"]);
}
export function statusTemp(s: MachineStatus | null): string {
  if (!s) return "";
  const f = pickNum(s, ["TemperatureFahrenheit"]);
  if (f !== null) return `${f}°F`;
  const c = pickNum(s, ["TemperatureCelcius", "TemperatureCelsius"]);
  if (c !== null) return `${c}°C`;
  return "";
}
export function statusFirmware(s: MachineStatus | null): string {
  if (!s) return "";
  return pickStr(s, ["FirmwareVersion", "Firmware", "Version", "SoftwareVersion"]);
}
