import "server-only";
import {
  type NayaxConn,
  type Product,
  lynxWrite,
  getMachineProducts,
  productMdbCode,
  productPrice,
  productPar,
  productSlot,
  productName,
  productNayaxId,
  productMachineProductId,
} from "@/lib/nayax";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { mdbToSlot } from "@/lib/slot-code";

/**
 * The single path through which Slovend Intelligence changes a planogram.
 *
 * Both the write canary and the slot editor call `executePlanogramPut`, so the
 * path we prove safe during discovery is byte-for-byte the path used in
 * production — they cannot drift apart.
 *
 * Three invariants hold everywhere in this module:
 *  1. No write without an audit row. The row is inserted before the request
 *     leaves, so a crash still leaves the pre-write snapshot behind.
 *  2. No write without a database, because (1) would be unenforceable.
 *  3. Every PUT carries the COMPLETE row set just fetched, with only the
 *     targeted fields altered. See buildFullSetPayload.
 */

/**
 * Whole-planogram write.
 *
 * `avoidDelete=true` is NOT optional. Per the Lynx reference, this endpoint's
 * default is `avoidDelete=false`, which REPLACES the entire product map — any
 * row absent from the payload is deleted. Every call here is pinned to the
 * non-destructive mode so that a payload which somehow omits a row can never
 * silently destroy it.
 */
export const PLANOGRAM_PATH = (machineId: string | number) =>
  `/operational/v1/machines/${machineId}/machineProducts?avoidDelete=true`;

/**
 * Single-row write: updates one slot in place and submits nothing else.
 *
 * This is the endpoint that makes editing possible on a machine whose other
 * slots are unassigned — Lynx validates the rows it is given, so a slot that
 * already has a NayaxProductID can be updated even while 31 siblings sit at 0.
 */
export const PLANOGRAM_ROW_PATH = (machineId: string | number, machineProductId: string | number) =>
  `/operational/v1/machines/${machineId}/machineProducts/${machineProductId}`;

/* ------------------------------ policy ------------------------------- */

export const PRICE_MIN = 0.01;
export const PRICE_MAX = 50;
export const PAR_MIN = 0;
export const PAR_MAX = 999;
export const MAX_EDITS = 60;

/**
 * Fields written for a price / par change.
 *
 * These are the names Lynx *reads* back (see productPrice/productPar), which is
 * the best available guess until the canary observes a real accepted write.
 * If the canary returns a 4xx naming different fields, change them here — this
 * is deliberately the only place that knows them.
 */
export const PRICE_WRITE_FIELDS = ["MachinePrice"] as const;
export const PAR_WRITE_FIELDS = ["PAR"] as const;

/**
 * Fields a live machine can legitimately change between our pre-write read and
 * our verification read — a single vend moves all of them. Excluded from diffs
 * so a sale during a write is not misreported as an unintended mutation.
 */
const IGNORED_DIFF_FIELDS = new Set([
  "CurrentQuantity",
  "MissingStockByMDB",
  "MissingStockByDEX",
  "SelectionVendOutBit",
  "VendOut",
  "SoldOut",
]);

const isVolatile = (key: string) =>
  IGNORED_DIFF_FIELDS.has(key) || /date|time/i.test(key);

/* ------------------------------- types ------------------------------- */

export type SlotEdit = { mdb: number; newPrice?: number; newPar?: number };

export type WriteAction = "canary" | "slot_change" | "revert" | "restore";

export type WriteStatus =
  | "verified"
  | "applied_unverified"
  | "mismatch"
  | "failed"
  | "unknown";

export type ChangeRecord = {
  mdb: number;
  slot: string;
  name: string;
  old_price: number | null;
  new_price: number | null;
  old_par: number | null;
  new_par: number | null;
};

export type PlanogramDiff = {
  identical: boolean;
  changed: { mdb: number; field: string; before: unknown; after: unknown }[];
  missing: number[];
  added: number[];
  /** Raw row counts. Rows the MDB index cannot key individually — no MDBCode at
   * all, or a duplicate code that overwrote its sibling — are invisible to
   * `changed`/`missing`/`added`, so the count is the only signal that survives
   * for exactly the rows most at risk from replace semantics. */
  countBefore: number;
  countAfter: number;
};

/* --------------------------- write readiness -------------------------- */

export type WriteReadiness = {
  total: number;
  ready: number;
  blockedSlots: string[];
  canWrite: boolean;
};

/**
 * Whether Nayax will accept a planogram write for these rows at all.
 *
 * Confirmed against the live API on 2026-08-04: `PUT machineProducts` validates
 * every item in the payload and rejects the whole request with
 * "Item number N contains invalid NayaxProductID: 0" if any row has no catalog
 * product assigned. Since every write we make carries the full row set (see
 * buildFullSetPayload), a single unassigned slot blocks all price and par
 * editing for the entire machine.
 *
 * This is a pre-flight check so the UI can explain that up front instead of
 * spending a rejected round-trip to discover it.
 */
export function assessWriteReadiness(rows: Product[]): WriteReadiness {
  const blockedSlots: string[] = [];
  for (const r of rows) {
    if (productNayaxId(r) == null) blockedSlots.push(productSlot(r) || "—");
  }
  return {
    total: rows.length,
    ready: rows.length - blockedSlots.length,
    blockedSlots,
    canWrite: rows.length > 0 && blockedSlots.length === 0,
  };
}

/* ----------------------------- validation ---------------------------- */

/** Money comparison that tolerates float representation (1.1*3 !== 3.3). */
const cents = (n: number) => Math.round(n * 100);

export function validateEdits(input: unknown): { edits: SlotEdit[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(input)) return { edits: [], errors: ["Edits must be a list."] };
  if (input.length > MAX_EDITS) {
    return { edits: [], errors: [`Too many changes at once (max ${MAX_EDITS}).`] };
  }

  const byMdb = new Map<number, SlotEdit>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      errors.push("Malformed change entry.");
      continue;
    }
    const r = raw as Record<string, unknown>;
    const mdb = Number(r.mdb);
    if (!Number.isInteger(mdb) || mdb <= 0) {
      errors.push(`Invalid slot code: ${String(r.mdb)}`);
      continue;
    }
    const slot = mdbToSlot(mdb);

    const edit: SlotEdit = { mdb };
    let touched = false;

    if (r.newPrice !== undefined && r.newPrice !== null && r.newPrice !== "") {
      const p = Number(r.newPrice);
      if (!Number.isFinite(p)) {
        errors.push(`Slot ${slot}: price is not a number.`);
      } else if (p < PRICE_MIN || p > PRICE_MAX) {
        errors.push(`Slot ${slot}: price must be between $${PRICE_MIN} and $${PRICE_MAX}.`);
      } else if (Math.abs(cents(p) - p * 100) > 1e-6) {
        errors.push(`Slot ${slot}: price must be a whole number of cents.`);
      } else {
        edit.newPrice = cents(p) / 100;
        touched = true;
      }
    }

    if (r.newPar !== undefined && r.newPar !== null && r.newPar !== "") {
      const v = Number(r.newPar);
      if (!Number.isInteger(v)) {
        errors.push(`Slot ${slot}: par must be a whole number.`);
      } else if (v < PAR_MIN || v > PAR_MAX) {
        errors.push(`Slot ${slot}: par must be between ${PAR_MIN} and ${PAR_MAX}.`);
      } else {
        edit.newPar = v;
        touched = true;
      }
    }

    if (!touched) continue;
    // Last edit wins per slot: two entries for one slot would otherwise make the
    // applied result depend on payload ordering.
    const prior = byMdb.get(mdb);
    byMdb.set(mdb, prior ? { ...prior, ...edit } : edit);
  }

  return { edits: [...byMdb.values()], errors };
}

/* ---------------------------- payload build --------------------------- */

/**
 * Build the request body: every fetched row, verbatim, with only the targeted
 * fields replaced on matched rows.
 *
 * This is the module's central safety property. We do not know whether Lynx
 * treats this PUT as a patch or as a whole-planogram replace. Sending the full
 * set is correct under both readings — a superset no-op under patch semantics,
 * an exact reproduction under replace semantics. Sending a subset would be
 * correct under one and catastrophic under the other (it would delete every
 * unlisted slot), so subsets are never built.
 *
 * Rows are copied field-for-field including fields this codebase has no reader
 * for; dropping an unrecognized field would silently clear it under replace
 * semantics.
 */
export function buildFullSetPayload(
  rows: Product[],
  edits: SlotEdit[],
): { payload: Product[]; applied: SlotEdit[]; unmatched: number[] } {
  const byMdb = new Map<number, SlotEdit>();
  for (const e of edits) byMdb.set(e.mdb, e);

  const applied: SlotEdit[] = [];
  const payload = rows.map((row) => {
    const copy: Product = { ...row };
    const code = productMdbCode(row);
    const edit = code != null ? byMdb.get(code) : undefined;
    if (!edit) return copy;

    if (edit.newPrice !== undefined) {
      for (const f of PRICE_WRITE_FIELDS) copy[f] = edit.newPrice;
    }
    if (edit.newPar !== undefined) {
      for (const f of PAR_WRITE_FIELDS) copy[f] = edit.newPar;
    }
    applied.push(edit);
    return copy;
  });

  const appliedMdbs = new Set(applied.map((e) => e.mdb));
  const unmatched = edits.filter((e) => !appliedMdbs.has(e.mdb)).map((e) => e.mdb);
  return { payload, applied, unmatched };
}

/* -------------------------------- diff -------------------------------- */

/**
 * Compare two planogram snapshots by MDB code. Volatile fields are skipped so a
 * vend landing mid-write does not read as an unintended change.
 *
 * The MDB index is necessarily lossy: this machine carries a phantom MDB 0 row
 * (see lib/inventory-view.ts), and rows can arrive with a PACode but no MDBCode,
 * so duplicates collapse and un-keyed rows are absent from both sides. Those are
 * precisely the rows a lossy replace would destroy silently, which is why the
 * raw row count is compared as well and feeds `identical`.
 */
export function diffPlanograms(before: Product[], after: Product[]): PlanogramDiff {
  const index = (rows: Product[]) => {
    const m = new Map<number, Product>();
    for (const r of rows) {
      const c = productMdbCode(r);
      if (c != null) m.set(c, r);
    }
    return m;
  };
  const a = index(before);
  const b = index(after);

  const changed: PlanogramDiff["changed"] = [];
  const missing: number[] = [];
  for (const [mdb, rowA] of a) {
    const rowB = b.get(mdb);
    if (!rowB) {
      missing.push(mdb);
      continue;
    }
    const keys = new Set([...Object.keys(rowA), ...Object.keys(rowB)]);
    for (const k of keys) {
      if (isVolatile(k)) continue;
      const va = rowA[k];
      const vb = rowB[k];
      if (JSON.stringify(va ?? null) !== JSON.stringify(vb ?? null)) {
        changed.push({ mdb, field: k, before: va, after: vb });
      }
    }
  }
  const added = [...b.keys()].filter((k) => !a.has(k));
  const countMatches = before.length === after.length;

  return {
    identical: countMatches && changed.length === 0 && missing.length === 0 && added.length === 0,
    changed,
    missing,
    added,
    countBefore: before.length,
    countAfter: after.length,
  };
}

/** Human-readable diff lines for the canary panel. */
export function describeDiff(d: PlanogramDiff, limit = 12): string[] {
  const out: string[] = [];
  if (d.countBefore !== d.countAfter) {
    out.push(
      `Row count changed: ${d.countBefore} → ${d.countAfter} ` +
        `(rows without a unique MDB code are not tracked individually)`,
    );
  }
  for (const m of d.missing) out.push(`Slot ${mdbToSlot(m)} (MDB ${m}) is GONE after the write`);
  for (const a of d.added) out.push(`Slot ${mdbToSlot(a)} (MDB ${a}) appeared after the write`);
  for (const c of d.changed) {
    out.push(
      `Slot ${mdbToSlot(c.mdb)} · ${c.field}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`,
    );
  }
  return out.slice(0, limit);
}

/** Compact record of what an edit set intends, for the audit log and the UI. */
export function describeChanges(rows: Product[], edits: SlotEdit[]): ChangeRecord[] {
  const byMdb = new Map<number, Product>();
  for (const r of rows) {
    const c = productMdbCode(r);
    if (c != null) byMdb.set(c, r);
  }
  return edits.map((e) => {
    const row = byMdb.get(e.mdb);
    return {
      mdb: e.mdb,
      slot: mdbToSlot(e.mdb),
      name: row ? productName(row) : "",
      old_price: row ? productPrice(row) : null,
      new_price: e.newPrice ?? null,
      old_par: row ? productPar(row) : null,
      new_par: e.newPar ?? null,
    };
  });
}

/* ---------------------------- row-level write -------------------------- */

export type RowTarget = {
  machineProductId: number;
  mdb: number | null;
  slot: string;
  name: string;
  price: number | null;
  par: number | null;
  nayaxProductId: number | null;
};

/**
 * Slots that can be written one at a time.
 *
 * `PUT .../machineProducts/{MachineProductID}` submits only the row it names, and
 * Lynx validates only the rows it is given — so a slot with a real
 * NayaxProductID is editable even while other slots sit at 0. That is what makes
 * editing possible on this machine without first mapping all 33 slots.
 *
 * A row needs BOTH ids to qualify: MachineProductID to address it, and a
 * non-zero NayaxProductID to survive validation.
 */
export function rowWritableSlots(rows: Product[]): RowTarget[] {
  const out: RowTarget[] = [];
  for (const r of rows) {
    const machineProductId = productMachineProductId(r);
    const nayaxProductId = productNayaxId(r);
    if (machineProductId == null || nayaxProductId == null) continue;
    out.push({
      machineProductId,
      mdb: productMdbCode(r),
      slot: productSlot(r) || "—",
      name: productName(r),
      price: productPrice(r),
      par: productPar(r),
      nayaxProductId,
    });
  }
  return out;
}

export function findRowByMachineProductId(rows: Product[], machineProductId: number): Product | null {
  for (const r of rows) {
    if (productMachineProductId(r) === machineProductId) return r;
  }
  return null;
}

/**
 * Body for a single-row write: the row exactly as Lynx returned it, with only
 * the targeted fields replaced.
 *
 * Sending the whole row rather than a sparse patch sidesteps a question the
 * reference does not answer — every field is nullable, so an omitted field and
 * a field explicitly set to null are indistinguishable, and we have no way to
 * know whether omission means "leave alone" or "clear". Echoing the row back
 * makes the question moot.
 */
export function buildRowPayload(row: Product, edit: SlotEdit): Product {
  const copy: Product = { ...row };
  if (edit.newPrice !== undefined) {
    for (const f of PRICE_WRITE_FIELDS) copy[f] = edit.newPrice;
  }
  if (edit.newPar !== undefined) {
    for (const f of PAR_WRITE_FIELDS) copy[f] = edit.newPar;
  }
  return copy;
}

/* ------------------------------ execution ----------------------------- */

export type ExecuteInput = {
  conn: NayaxConn;
  userKey: string;
  machineId: string;
  action: WriteAction;
  /** ALWAYS the full planogram, even for a single-row write — the verification
   * diff compares whole snapshots so collateral damage to untouched slots is
   * detected rather than assumed away. */
  beforeRows: Product[];
  payload: unknown;
  changes: ChangeRecord[] | null;
  revertsId?: number | null;
  payloadMode?: string;
  /** Defaults to the whole-map path. Single-row writes pass PLANOGRAM_ROW_PATH. */
  path?: string;
};

export type ExecuteResult = {
  auditId: number | null;
  httpStatus: number;
  responseExcerpt: string;
  afterRows: Product[] | null;
  diff: PlanogramDiff | null;
  status: WriteStatus;
};

/**
 * Decide what actually happened, given the HTTP result and the verification read.
 *
 * `intendedOnly` means the post-write planogram differs from the pre-write one in
 * exactly the ways we asked for and no others.
 */
export function decideStatus(args: {
  httpStatus: number;
  afterRows: Product[] | null;
  diff: PlanogramDiff | null;
  intendedOnly: boolean;
  changedSomething: boolean;
}): WriteStatus {
  const { httpStatus, afterRows, diff, intendedOnly, changedSomething } = args;

  if (httpStatus === 0) {
    // No response at all — the request may never have left the process (DNS
    // failure, TLS reset, socket hangup, a proxy that allows GET but drops PUT).
    // The transport can therefore prove nothing, so only the machine's own state
    // counts, and it must show the change we asked for.
    //
    // An UNCHANGED planogram here is NOT success: it is equally consistent with
    // "the write never arrived" and "the write arrived and did nothing", and we
    // cannot tell which. Calling that verified would be worst for the canary,
    // whose payload is a no-op by construction and so can never change anything
    // — it would mint the credential that unlocks slot editing from a request
    // that never reached Nayax.
    if (!afterRows || !diff) return "unknown";
    if (intendedOnly && changedSomething) return "verified";
    if (intendedOnly) return "unknown";
    return "mismatch";
  }
  if (httpStatus < 200 || httpStatus >= 300) return "failed";
  if (!afterRows || !diff) return "applied_unverified";
  if (!intendedOnly) return "mismatch";
  // Accepted, and the planogram now differs only as intended. For a canary
  // (no changes requested) an identical planogram is exactly the success case.
  return "verified";
}

/** True when every observed change is one the edit set asked for. */
function changesAreIntended(diff: PlanogramDiff, changes: ChangeRecord[] | null): boolean {
  if (diff.missing.length || diff.added.length) return false;
  // A row-count change is never something an edit set asks for, and it is the
  // only evidence available when the lost row had no unique MDB code.
  if (diff.countBefore !== diff.countAfter) return false;
  if (!diff.changed.length) return true;
  if (!changes || !changes.length) return false;

  const wanted = new Map<number, ChangeRecord>();
  for (const c of changes) wanted.set(c.mdb, c);

  return diff.changed.every((c) => {
    const want = wanted.get(c.mdb);
    if (!want) return false;
    if ((PRICE_WRITE_FIELDS as readonly string[]).includes(c.field)) {
      return want.new_price != null && cents(Number(c.after)) === cents(want.new_price);
    }
    if ((PAR_WRITE_FIELDS as readonly string[]).includes(c.field)) {
      return want.new_par != null && Number(c.after) === want.new_par;
    }
    return false;
  });
}

/**
 * Send one planogram mutation, with the audit row written first and a
 * verification read after. Never throws.
 */
export async function executePlanogramPut(input: ExecuteInput): Promise<ExecuteResult> {
  const {
    conn,
    userKey,
    machineId,
    action,
    beforeRows,
    payload,
    changes,
    revertsId = null,
    payloadMode = "full-set",
    path,
  } = input;

  if (!dbConfigured()) {
    // Invariant 2: without the audit log we cannot honour invariant 1, so we
    // refuse to send anything at all.
    return {
      auditId: null,
      httpStatus: 0,
      responseExcerpt: "",
      afterRows: null,
      diff: null,
      status: "failed",
    };
  }

  await ensureSchema();
  const sql = getSql();

  const inserted = (await sql`
    insert into planogram_writes
      (user_key, machine_id, action, status, payload_mode, changes, before_rows, request_body, reverts_id)
    values (${userKey}, ${machineId}, ${action}, 'sending', ${payloadMode},
            ${JSON.stringify(changes)}::jsonb, ${JSON.stringify(beforeRows)}::jsonb,
            ${JSON.stringify(payload)}::jsonb, ${revertsId})
    returning id
  `) as { id: number }[];
  const auditId = inserted[0]?.id ?? null;

  const write = await lynxWrite(conn, path ?? PLANOGRAM_PATH(machineId), "PUT", payload);

  // Always re-read, even when the transport failed: a timed-out request may
  // still have been applied, and only the machine's own state can settle that.
  let afterRows: Product[] | null = null;
  try {
    afterRows = await getMachineProducts(conn, machineId);
  } catch {
    afterRows = null;
  }

  const diff = afterRows ? diffPlanograms(beforeRows, afterRows) : null;
  const intendedOnly = diff ? changesAreIntended(diff, changes) : false;
  const status = decideStatus({
    httpStatus: write.status,
    afterRows,
    diff,
    intendedOnly,
    changedSomething: Boolean(diff && !diff.identical),
  });

  if (auditId != null) {
    await sql`
      update planogram_writes
         set status = ${status},
             http_status = ${write.status},
             after_rows = ${afterRows ? JSON.stringify(afterRows) : null}::jsonb,
             response_body = ${write.body}
       where id = ${auditId}
    `;
  }

  return {
    auditId,
    httpStatus: write.status,
    responseExcerpt: write.body.slice(0, 600),
    afterRows,
    diff,
    status,
  };
}

/* ------------------------------- queries ------------------------------ */

/** Whether this user has already proven the write path on this machine. */
export async function hasVerifiedCanary(userKey: string, machineId: string): Promise<boolean> {
  if (!dbConfigured() || !userKey || !machineId) return false;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select 1 from planogram_writes
     where user_key = ${userKey} and machine_id = ${machineId}
       and action = 'canary' and status = 'verified'
     limit 1
  `) as unknown[];
  return rows.length > 0;
}

export type WriteLogRow = {
  id: number;
  action: WriteAction;
  status: WriteStatus | "sending";
  httpStatus: number | null;
  changes: ChangeRecord[] | null;
  createdAt: string;
  revertedById: number | null;
};

export async function listRecentWrites(
  userKey: string,
  machineId: string,
  limit = 10,
): Promise<WriteLogRow[]> {
  if (!dbConfigured() || !userKey || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select w.id, w.action, w.status, w.http_status, w.changes, w.created_at,
           (select r.id from planogram_writes r
             where r.reverts_id = w.id and r.status in ('verified','applied_unverified')
             limit 1) as reverted_by
      from planogram_writes w
     where w.user_key = ${userKey} and w.machine_id = ${machineId}
       and w.action <> 'canary'
     order by w.created_at desc
     limit ${limit}
  `) as {
    id: number;
    action: WriteAction;
    status: WriteStatus | "sending";
    http_status: number | null;
    changes: ChangeRecord[] | null;
    created_at: string;
    reverted_by: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    status: r.status,
    httpStatus: r.http_status,
    changes: r.changes,
    createdAt: r.created_at,
    revertedById: r.reverted_by,
  }));
}

export async function getWrite(
  userKey: string,
  machineId: string,
  id: number,
): Promise<(WriteLogRow & { beforeRows: Product[] }) | null> {
  if (!dbConfigured()) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select w.id, w.action, w.status, w.http_status, w.changes, w.created_at, w.before_rows,
           (select r.id from planogram_writes r
             where r.reverts_id = w.id and r.status in ('verified','applied_unverified')
             limit 1) as reverted_by
      from planogram_writes w
     where w.id = ${id} and w.user_key = ${userKey} and w.machine_id = ${machineId}
     limit 1
  `) as {
    id: number;
    action: WriteAction;
    status: WriteStatus | "sending";
    http_status: number | null;
    changes: ChangeRecord[] | null;
    created_at: string;
    before_rows: Product[];
    reverted_by: number | null;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    action: r.action,
    status: r.status,
    httpStatus: r.http_status,
    changes: r.changes,
    createdAt: r.created_at,
    revertedById: r.reverted_by,
    beforeRows: r.before_rows ?? [],
  };
}

/** Current price/par per slot, for preview and staleness checks. */
export function snapshotSlots(rows: Product[]): Map<number, { price: number | null; par: number | null; name: string; slot: string }> {
  const m = new Map<number, { price: number | null; par: number | null; name: string; slot: string }>();
  for (const r of rows) {
    const c = productMdbCode(r);
    if (c == null || c <= 0) continue;
    m.set(c, {
      price: productPrice(r),
      par: productPar(r),
      name: productName(r),
      slot: productSlot(r),
    });
  }
  return m;
}
