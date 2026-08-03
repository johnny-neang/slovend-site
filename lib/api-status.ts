import "server-only";
import {
  type NayaxConn,
  listMachines,
  getMachine,
  getMachineProducts,
  productNayaxId,
  probeEndpoint,
  probeWriteEndpoint,
  getCatalogProduct,
} from "@/lib/nayax";

export type Access =
  | "ok"
  | "granted"
  | "forbidden"
  | "unauthorized"
  | "missing"
  | "inconclusive"
  | "error"
  | "untested";

export type EndpointRow = {
  key: string;
  label: string;
  method: string;
  type: "read" | "write";
  access: Access;
  code: number | null;
  note?: string;
};

/** One field of a real catalog-product body, for confirming which keys Lynx uses. */
export type CatalogField = { key: string; type: string; preview: string };

/** A real catalog product, flattened to key/type/value so the field names the
 * catalog* readers in lib/nayax.ts guess at can be confirmed against actual data. */
export type CatalogInspection = { productId: string; fields: CatalogField[] };

/** Result returned by the "Test access" server action (drives <AccessTester>). */
export type AccessResult = {
  ran: boolean;
  rows: EndpointRow[];
  catalog?: CatalogInspection | null;
  error?: string;
};

function classify(code: number): Access {
  if (code >= 200 && code < 300) return "ok";
  if (code === 403) return "forbidden";
  if (code === 401) return "unauthorized";
  if (code === 404) return "missing";
  return "error";
}

/** Live-probe the read endpoints Slovend Intelligence uses against the operator's token. */
export async function probeReadEndpoints(conn: NayaxConn): Promise<EndpointRow[]> {
  let mid = conn.machineId;
  if (!mid) {
    try {
      const ms = await listMachines(conn);
      mid = ms[0]?.MachineID != null ? String(ms[0].MachineID) : "";
    } catch {
      mid = "";
    }
  }

  const reads: { key: string; label: string; path: string }[] = [
    { key: "machines", label: "List machines", path: "/operational/v1/machines" },
    { key: "machine", label: "Machine details", path: `/operational/v1/machines/${mid}` },
    { key: "sales", label: "Recent sales", path: `/operational/v1/machines/${mid}/lastSales` },
    { key: "alerts", label: "Alerts & events", path: `/operational/v1/machines/${mid}/lastAlerts` },
    { key: "products", label: "Planogram / inventory", path: `/operational/v1/machines/${mid}/machineProducts` },
    { key: "status", label: "Machine health", path: `/operational/v1/machines/${mid}/status` },
  ];

  const base = await Promise.all(
    reads.map(async (r): Promise<EndpointRow> => {
      if (r.key !== "machines" && !mid) {
        return { ...r, method: "GET", type: "read", access: "untested", code: null, note: "no machine to test" };
      }
      const code = await probeEndpoint(conn, r.path);
      return { ...r, method: "GET", type: "read", access: code ? classify(code) : "error", code: code || null };
    }),
  );

  const catalog = await probeCatalog(conn, mid);
  return [...base, ...catalog];
}

/** Probe the Nayax catalog reads that would power product image/name/description.
 * Catalog detail is needed to enrich slots that have a NayaxProductID; the list
 * confirms operator-wide catalog access. Both are commonly 403 until the token
 * is granted catalog scope. Self-contained: derives a sample product id from the
 * planogram and the operator id from the machine record; marks rows "untested"
 * when those can't be resolved rather than reporting a misleading 404. */
async function probeCatalog(conn: NayaxConn, mid: string): Promise<EndpointRow[]> {
  const rows: EndpointRow[] = [];
  const mk = (key: string, label: string, code: number): EndpointRow => ({
    key, label, method: "GET", type: "read",
    access: code ? classify(code) : "error", code: code || null,
  });

  // A sample catalog product id from a slot that links to one.
  let sampleId = "";
  // The operator ActorID that owns the catalog.
  let operatorId = "";
  if (mid) {
    try {
      const prods = await getMachineProducts(conn, mid);
      for (const p of prods) {
        const n = productNayaxId(p);
        if (n) { sampleId = String(n); break; }
      }
    } catch { /* ignore */ }
    try {
      const m = await getMachine(conn, mid);
      const v = m ? (m.OperatorActorID ?? m.ActorID ?? m.OperatorID) : null;
      if (v != null && v !== "") operatorId = String(v);
    } catch { /* ignore */ }
  }

  // One probe only: lynx.nayax.com 301s /v1/... to /operational/v1/..., so the
  // two prefixes are the same endpoint and probing both just duplicated a row.
  if (sampleId) {
    rows.push(mk("catalog-detail", "Catalog product (detail)", await probeEndpoint(conn, `/operational/v1/products/${sampleId}`)));
  } else {
    rows.push({ key: "catalog-detail", label: "Catalog product (detail)", method: "GET", type: "read", access: "untested", code: null, note: "no slot has a catalog product" });
  }

  // Operator-wide catalog list.
  if (operatorId) {
    rows.push(mk("catalog-list", "Catalog products (list)", await probeEndpoint(conn, `/v1/operators/${operatorId}/products`)));
  } else {
    rows.push({ key: "catalog-list", label: "Catalog products (list)", method: "GET", type: "read", access: "untested", code: null, note: "operator id unknown" });
  }

  return rows;
}

/* -------------------------- catalog inspection -------------------------- */

function describeFields(o: Record<string, unknown>): CatalogField[] {
  return Object.entries(o).map(([key, v]) => {
    const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    let preview: string;
    if (v === null || v === undefined) preview = "—";
    else if (typeof v === "object") preview = JSON.stringify(v);
    else preview = String(v);
    return { key, type, preview: preview.slice(0, 160) };
  });
}

/**
 * Fetch one real catalog product and flatten it to key/type/value.
 *
 * The catalogName/catalogImage/catalogDescription readers in lib/nayax.ts were
 * written against a 403 — every candidate field name in them is a guess. Now
 * that catalog reads return 200, this surfaces an actual body so those guesses
 * can be replaced with the real keys. Read-only; returns null when no slot on
 * the machine links to a catalog product (NayaxProductID 0), which is the common
 * case. Never throws.
 */
export async function inspectCatalogProduct(conn: NayaxConn): Promise<CatalogInspection | null> {
  let mid = conn.machineId;
  if (!mid) {
    try {
      const ms = await listMachines(conn);
      mid = ms[0]?.MachineID != null ? String(ms[0].MachineID) : "";
    } catch {
      return null;
    }
  }
  if (!mid) return null;

  let sampleId = 0;
  try {
    for (const p of await getMachineProducts(conn, mid)) {
      const n = productNayaxId(p);
      if (n) {
        sampleId = n;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!sampleId) return null;

  const c = await getCatalogProduct(conn, sampleId);
  if (!c) return null;
  return { productId: String(sampleId), fields: describeFields(c) };
}

/* ------------------------------- writes ------------------------------- */

/**
 * Ids chosen so they cannot correspond to a real record. Every write probe is
 * aimed at one of these, so a probe can clear the authorization gate and still
 * be incapable of changing anything: the resource it names does not exist.
 */
const GHOST_MACHINE = 999999999;
const GHOST_PRODUCT = 999999999;

/**
 * What a given status actually proves. The codes are NOT equally strong:
 *
 *   404  conclusive. Authorization passed, the server then looked for the ghost
 *        record and did not find it. Nothing else produces that sequence.
 *   400  probable only. The probe body is `{}`; if this route validates the body
 *        BEFORE checking permissions, a 400 says nothing about scope. Absence of
 *        403 is still meaningful, it just is not proof.
 *   5xx  not a denial. A denied scope returns 403, so a server error means the
 *        request most likely cleared the gate and then broke inside Nayax.
 */
function writeNote(code: number): string {
  if (code === 404) return "conclusive — cleared authz, then 404 on the missing record";
  if (code === 400 || code === 422)
    return "probable, not proof — may be body validation running before the permission check";
  if (code === 403) return "stopped at the permission gate";
  if (code >= 500) return "Nayax server error, not a denial — worth reporting to them";
  if (code >= 300 && code < 400) return "redirected — wrong path prefix, result is meaningless";
  return "sent at a non-existent id — nothing is written";
}

/**
 * Write probes read inversely to reads: a 404/400/422 is the SUCCESS signal. The
 * request passed the permission gate and only then failed on the missing ghost
 * record, which is exactly the proof that the scope is granted. 403 is the token
 * being stopped at the gate.
 */
function classifyWrite(code: number): Access {
  if (code >= 200 && code < 300) return "granted";
  if (code === 400 || code === 404 || code === 422) return "granted";
  if (code === 403) return "forbidden";
  if (code === 401) return "unauthorized";
  if (code >= 300 && code < 400) return "error";
  return "inconclusive";
}

/**
 * Live-probe write scope with the operator's token, without mutating anything.
 *
 * Only ghost-id probes run here. Create endpoints (POST /productGroups,
 * POST /operators/{id}/products, POST /metadata/upload-picture) have no id to
 * ghost — probing them means POSTing a deliberately invalid body and trusting
 * the API to reject it, which risks leaving a junk record in a live catalog.
 * That is an acceptable trade in a deliberate CLI run
 * (scripts/verify-nayax-scopes.sh) but not behind a dashboard button, so those
 * are listed as un-probed below rather than fired from here.
 */
export async function probeWriteEndpoints(conn: NayaxConn): Promise<EndpointRow[]> {
  const probes = [
    {
      key: "w-catalog",
      label: "Update catalog product",
      method: "PUT" as const,
      path: `/operational/v1/products/${GHOST_PRODUCT}`,
    },
    {
      key: "w-planogram",
      label: "Update planogram & prices",
      method: "PUT" as const,
      path: `/operational/v1/machines/${GHOST_MACHINE}/machineProducts`,
    },
    {
      key: "w-planogram-add",
      label: "Add planogram row",
      method: "POST" as const,
      path: `/operational/v1/machines/${GHOST_MACHINE}/machineProducts`,
    },
  ];

  const probed = await Promise.all(
    probes.map(async (p): Promise<EndpointRow> => {
      const code = await probeWriteEndpoint(conn, p.path, p.method);
      return {
        key: p.key,
        label: p.label,
        method: p.method,
        type: "write",
        access: code ? classifyWrite(code) : "error",
        code: code || null,
        note: code ? writeNote(code) : "no response",
      };
    }),
  );

  return [...probed, ...UNPROBED_WRITES];
}

/** Write capabilities that exist in Lynx but have no safe non-mutating probe.
 * Shown so the picture stays complete rather than implying these don't exist. */
const UNPROBED_WRITES: EndpointRow[] = [
  {
    key: "w-groups",
    label: "Create / manage product groups",
    method: "POST/PUT/DELETE",
    type: "write",
    access: "untested",
    code: null,
    note: "no ghost id to target — would risk creating a record",
  },
  {
    key: "w-routes",
    label: "Assign machines to routes",
    method: "POST",
    type: "write",
    access: "untested",
    code: null,
    note: "no ghost id to target — would risk creating a record",
  },
];
