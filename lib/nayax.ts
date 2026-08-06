import "server-only";
import { mdbToSlot } from "@/lib/slot-code";

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

/** Probe an endpoint with the caller's token and return the raw HTTP status
 * (Bearer first, then raw-token fallback). Used by the API-access page to show
 * which endpoints a user's Nayax token can reach. Never throws. */
export async function probeEndpoint(conn: NayaxConn, path: string): Promise<number> {
  const base = conn.base.replace(/\/$/, "");
  const url = `${base}${path}`;
  try {
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
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Probe a write endpoint and return the raw HTTP status. Used by the API-access
 * page to show whether the operator's Nayax role grants write scope.
 *
 * Callers MUST target an id that cannot exist (see GHOST_* in lib/api-status.ts):
 * authorization is evaluated before the resource is resolved, so a granted scope
 * surfaces as 404/400/422 — the request clears the permission gate and then
 * fails on existence, writing nothing. A denied scope stops at 403.
 *
 * Redirects are NOT followed: lynx.nayax.com 301s bare /v1/... to
 * /operational/v1/..., and fetch rewrites a redirected POST/PUT to GET, which
 * would silently turn a write probe into a meaningless read. Surface the 3xx
 * instead so a wrong prefix is visible rather than reported as a false result.
 *
 * Never throws.
 */
export async function probeWriteEndpoint(
  conn: NayaxConn,
  path: string,
  method: WriteMethod,
  payload: unknown = {},
): Promise<number> {
  return (await lynxWrite(conn, path, method, payload)).status;
}

export type WriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type LynxWriteResult = {
  /** True only for 2xx. */
  ok: boolean;
  /** Raw HTTP status; 0 means the request never got a response. */
  status: number;
  /** A 3xx was returned and deliberately NOT followed — see below. */
  redirected: boolean;
  /** Response text, truncated. Persisted to the audit log: on a 4xx this body is
   * how we learn the payload shape Lynx actually expects. */
  body: string;
};

const MAX_RESPONSE_CAPTURE = 4000;

/**
 * Perform a real mutation against Lynx. The only function in the codebase that
 * changes anything in a Nayax account.
 *
 * Redirects are never followed. lynx.nayax.com 301s bare `/v1/...` to
 * `/operational/v1/...`, and fetch rewrites a redirected POST/PUT into a GET —
 * which would silently turn a write into a read and report success for a
 * mutation that never happened. A 3xx is surfaced as a failure instead.
 *
 * The Bearer→raw-token retry re-sends the request body, which is only safe
 * because 401/403 means the gateway rejected it before doing any work. Never
 * retry on any other status: a 5xx may well have applied.
 *
 * Returns a typed result and never throws — callers must record `status` and
 * `body` in the audit log before interpreting them, especially on failure.
 */
export async function lynxWrite(
  conn: NayaxConn,
  path: string,
  method: WriteMethod,
  payload: unknown,
): Promise<LynxWriteResult> {
  const base = conn.base.replace(/\/$/, "");
  const url = `${base}${path}`;
  const body = JSON.stringify(payload ?? {});
  const send = (auth: string) =>
    fetch(url, {
      method,
      headers: {
        Authorization: auth,
        accept: "application/json",
        "content-type": "application/json",
      },
      body,
      cache: "no-store",
      redirect: "manual",
    });
  try {
    let res = await send(`Bearer ${conn.token}`);
    if (res.status === 401 || res.status === 403) res = await send(conn.token);
    const text = await res.text().catch(() => "");
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      redirected: res.status >= 300 && res.status < 400,
      body: text.slice(0, MAX_RESPONSE_CAPTURE),
    };
  } catch {
    return { ok: false, status: 0, redirected: false, body: "" };
  }
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
/**
 * Raw MDB code for a sale. Lynx embeds it either in a field or inside the
 * ProductName (e.g. "Unknown(1028 = 1.00)"). Returned verbatim — including the
 * -1 Lynx uses for card pre-authorization events — so callers can tell a real
 * selection from reader noise. Null when no code is present at all.
 */
export function saleMdbCode(s: Sale): number | null {
  const code = pickNum(s, ["MDBCode", "MDB", "SelectionCode", "Selection"]);
  if (code !== null) return Number.isFinite(code) ? code : null;
  const m = pickStr(s, ["ProductName"]).match(/\((-?\d+)\s*=/);
  if (!m) return null;
  const parsed = parseInt(m[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A card pre-authorization, not a vend: Lynx logs these as MDB -1 for $0.00 when
 * a reader authorizes a card that never completes a purchase. Both conditions are
 * required so a genuine $0.00 vend (promo, free-vend test) is never discarded.
 */
export function isAuthNoise(s: Sale): boolean {
  return saleAmount(s) === 0 && saleMdbCode(s) === -1;
}

/** Vending slot for a sale, decoded from its MDB code. "—" when unmapped. */
export function saleSlot(s: Sale): string {
  const code = saleMdbCode(s);
  return code === null ? "—" : mdbToSlot(code);
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
/** Explicit event id if Lynx provides one (used as the dedup key when present). */
export function alertId(a: Alert): string {
  return pickStr(a, ["EventID", "EventId", "AlertID", "AlertId", "EventLogID", "Id", "ID"]);
}
/** Heuristic severity from the event text + category. Shared by ingest (stored)
 * and the dashboard (display) so both agree. */
export function alertSeverity(a: Alert): "high" | "med" | "low" {
  const s = `${alertText(a)} ${alertCategory(a)}`.toLowerCase();
  if (/(error|fault|fail|jam|critical|tamper|offline|down|empty|vend out)/.test(s)) return "high";
  if (/(warn|low|temperature|door|reader|disabled)/.test(s)) return "med";
  return "low";
}

/* products / planogram */
export function productName(p: Product): string {
  return pickStr(p, ["DEXProductName", "ProductName", "Product", "Name", "ItemName", "Description"]);
}
export function productBay(p: Product): string {
  return pickStr(p, ["MDBCode", "Selection", "Bay", "Code", "Column", "Position", "Slot", "PACode"]);
}
/**
 * Per-row planogram identifier. Documented in the Lynx reference for
 * `GET /v1/machines/{id}/machineProducts`, and the path parameter for
 * `PUT /v1/machines/{id}/machineProducts/{MachineProductID}` — the endpoint that
 * updates ONE slot without submitting the rest of the planogram.
 */
export function productMachineProductId(p: Product): number | null {
  const n = pickNum(p, ["MachineProductID", "MachineProductId"]);
  return n && n > 0 ? n : null;
}

/** Raw MDBCode integer as reported by Lynx — the value productSlot decodes the
 * human slot/selection from. Null when the planogram row carries no MDBCode. */
export function productMdbCode(p: Product): number | null {
  return pickNum(p, ["MDBCode"]);
}
/**
 * Human selection/slot from the Lynx MDBCode, which packs row in the high byte
 * and column in the low byte. The slot is the row followed by the column
 * zero-padded to two digits, e.g. 1032 = 0x0408 -> row 4, col 8 -> "408".
 * MDBCode 0 -> "—". Falls back to an explicit selection field if no MDBCode.
 */
export function productSlot(p: Product): string {
  const code = productMdbCode(p);
  if (code !== null && code > 0) return mdbToSlot(code);
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

/* catalog (the Nayax product SKUs that slots link to via NayaxProductID) */

// Verified 200 on 2026-08-04. lynx.nayax.com 301s bare /v1/... to
// /operational/v1/..., so both forms reach the same endpoint on a GET; the
// canonical prefix is used here so no redirect is involved.
const CATALOG_PRODUCT_PATH = (id: number | string) => `/operational/v1/products/${id}`;

// The operator's own catalog. Confirmed by the `Refs.create` value inside a real
// catalog body: "v1/operators/208366919/products".
const CATALOG_LIST_PATH = (operatorId: number | string) =>
  `/operational/v1/operators/${operatorId}/products`;

export type CatalogProduct = Record<string, unknown>;

/** The catalog product id assigned to a slot, or null when 0/absent. */
export function productNayaxId(p: Product): number | null {
  const n = pickNum(p, ["NayaxProductID", "NayaxProductId", "ProductID", "ProductId"]);
  return n && n > 0 ? n : null;
}

/** Fetch one catalog product by NayaxProductID. Returns null on any failure
 * (403/404/network) so callers degrade to slot-only rendering. Never throws. */
export async function getCatalogProduct(
  conn: NayaxConn,
  nayaxProductId: number | string,
): Promise<CatalogProduct | null> {
  if (!nayaxProductId || Number(nayaxProductId) <= 0) return null;
  try {
    const data = await lynx<unknown>(conn, CATALOG_PRODUCT_PATH(nayaxProductId));
    if (Array.isArray(data)) return (data[0] as CatalogProduct) ?? null;
    return data && typeof data === "object" ? (data as CatalogProduct) : null;
  } catch {
    return null;
  }
}

/** Fetch many catalog products, deduping by id and fetching in parallel. The
 * result map only contains ids that resolved to a non-null object. */
export async function getCatalogProducts(
  conn: NayaxConn,
  ids: Array<number | string>,
): Promise<Map<number, CatalogProduct>> {
  const unique = [...new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  const out = new Map<number, CatalogProduct>();
  await Promise.all(
    unique.map(async (id) => {
      const c = await getCatalogProduct(conn, id);
      if (c) out.set(id, c);
    }),
  );
  return out;
}

/** The operator id that owns the catalog. Present on catalog bodies as ActorID
 * and on machine records under one of several names. */
export function catalogOperatorId(o: Record<string, unknown>): string {
  return pickStr(o, ["ActorID", "OperatorActorID", "OperatorID", "ActorId"]);
}

/**
 * Every catalog product the operator owns — the set a slot can be mapped to.
 * Returns [] on any failure so callers can distinguish "no access" from "no
 * products" only by checking access separately. Never throws.
 */
export async function listCatalogProducts(
  conn: NayaxConn,
  operatorId: number | string,
): Promise<CatalogProduct[]> {
  if (!operatorId) return [];
  try {
    return asArray<CatalogProduct>(await lynx<unknown>(conn, CATALOG_LIST_PATH(operatorId)));
  } catch {
    return [];
  }
}

/*
 * Field names below are CONFIRMED against a real 200 body observed 2026-08-04
 * (catalog product 385498639827270), not guessed:
 *
 *   ProductName        "funny"
 *   DEXProductName     "funny onions"          <- what the machine itself displays
 *   ProductDescription "description of funny onons"
 *   ProductPictureUrl  null                    <- present, but unset on this product
 *
 * Aliases are kept behind the confirmed key only as tolerance for other Lynx
 * tenants; the first entry is the one this account actually returns.
 */
export function catalogName(c: CatalogProduct): string {
  // No "Description" fallback here — it used to mean an unnamed product rendered
  // its description as its name.
  return pickStr(c, ["ProductName", "DEXProductName", "Name", "DisplayName", "Title"]);
}
export function catalogImage(c: CatalogProduct): string {
  return pickStr(c, ["ProductPictureUrl", "ProductImageUrl", "ImageUrl", "PictureUrl", "ThumbnailUrl"]);
}
export function catalogDescription(c: CatalogProduct): string {
  return pickStr(c, ["ProductDescription", "LongDescription", "Description", "Details"]);
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
/** Numeric Celsius for storage/charting (converts from Fahrenheit if that's what
 * Lynx reports). Returns null when no temperature is present. */
export function statusTempC(s: MachineStatus | null): number | null {
  if (!s) return null;
  const f = pickNum(s, ["TemperatureFahrenheit"]);
  if (f !== null) return Math.round(((f - 32) * 5) / 9 * 10) / 10;
  const c = pickNum(s, ["TemperatureCelcius", "TemperatureCelsius"]);
  return c !== null ? c : null;
}
export function statusFirmware(s: MachineStatus | null): string {
  if (!s) return "";
  return pickStr(s, ["FirmwareVersion", "Firmware", "Version", "SoftwareVersion"]);
}
