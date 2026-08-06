"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCtx } from "@/lib/dashboard";
import { dbConfigured } from "@/lib/db";
import { getMachineProducts, type NayaxConn, type Product } from "@/lib/nayax";
import {
  validateEdits,
  buildRowPayload,
  describeChanges,
  describeDiff,
  executePlanogramPut,
  findRowByMachineProductId,
  hasVerifiedCanary,
  listRecentWrites,
  snapshotSlots,
  getWrite,
  PLANOGRAM_ROW_PATH,
  type SlotEdit,
  type WriteLogRow,
} from "@/lib/planogram-writes";

/**
 * Single-slot price and par edits.
 *
 * Every write here goes to `PUT .../machineProducts/{MachineProductID}`, which
 * submits one row. That matters on a machine where most slots are unmapped:
 * Lynx validates only the rows it is handed, so an assigned slot is editable
 * while unassigned ones are not — a whole-map write would be rejected outright.
 *
 * Preview never sends anything. Apply re-reads live state, refuses if the slot
 * moved underneath the preview, and records an audit row before the request
 * leaves.
 */

async function requireCtx() {
  const ctx = await getCtx();
  if (!ctx.email) redirect("/login");
  if (!ctx.conn || !ctx.machineId) redirect("/dashboard");
  return { userKey: ctx.email, conn: ctx.conn as NayaxConn, machineId: ctx.machineId };
}

export type SlotPreview = {
  ok: boolean;
  error?: string;
  slot?: string;
  name?: string;
  currentPrice?: number | null;
  currentPar?: number | null;
  newPrice?: number | null;
  newPar?: number | null;
  /** Server-issued snapshot the client must echo back to apply. */
  expected?: { price: number | null; par: number | null };
  canaryVerified?: boolean;
  unchanged?: boolean;
};

export type SlotApply = {
  ok: boolean;
  status:
    | "verified"
    | "ignored"
    | "applied_unverified"
    | "mismatch"
    | "failed"
    | "stale"
    | "blocked"
    | "unknown"
    | "noop";
  error?: string;
  httpStatus?: number;
  responseExcerpt?: string;
  auditId?: number | null;
  diffLines?: string[];
  slot?: string;
  liveNow?: { price: number | null; par: number | null };
};

function parseEdit(machineProductId: number, mdb: number, raw: { price?: string; par?: string }) {
  const candidate: Record<string, unknown> = { mdb };
  if (raw.price !== undefined && raw.price !== "") candidate.newPrice = Number(raw.price);
  if (raw.par !== undefined && raw.par !== "") candidate.newPar = Number(raw.par);
  const { edits, errors } = validateEdits([candidate]);
  return { edit: edits[0] as SlotEdit | undefined, errors, machineProductId };
}

/** Compute the diff server-side. Sends nothing. */
export async function previewSlotChange(
  machineProductId: number,
  raw: { price?: string; par?: string },
): Promise<SlotPreview> {
  const { userKey, conn, machineId } = await requireCtx();

  let rows: Product[] = [];
  try {
    rows = await getMachineProducts(conn, machineId);
  } catch {
    return { ok: false, error: "Couldn't read the planogram." };
  }

  const row = findRowByMachineProductId(rows, machineProductId);
  if (!row) return { ok: false, error: "That slot is no longer in the planogram." };

  const snap = snapshotSlots(rows);
  const mdb = Number(row.MDBCode ?? 0);
  const current = snap.get(mdb);

  const { edit, errors } = parseEdit(machineProductId, mdb, raw);
  if (errors.length) return { ok: false, error: errors[0] };
  if (!edit) return { ok: false, error: "Enter a new price or par level." };

  const samePrice = edit.newPrice === undefined || edit.newPrice === (current?.price ?? null);
  const samePar = edit.newPar === undefined || edit.newPar === (current?.par ?? null);

  return {
    ok: true,
    slot: current?.slot ?? "—",
    name: current?.name ?? "",
    currentPrice: current?.price ?? null,
    currentPar: current?.par ?? null,
    newPrice: edit.newPrice ?? null,
    newPar: edit.newPar ?? null,
    expected: { price: current?.price ?? null, par: current?.par ?? null },
    canaryVerified: await hasVerifiedCanary(userKey, machineId),
    unchanged: samePrice && samePar,
  };
}

export async function applySlotChange(
  machineProductId: number,
  raw: { price?: string; par?: string },
  expected: { price: number | null; par: number | null },
): Promise<SlotApply> {
  const { userKey, conn, machineId } = await requireCtx();

  if (!dbConfigured()) {
    return {
      ok: false,
      status: "blocked",
      error: "No database configured — a write that can't be audited is never sent.",
    };
  }
  if (!(await hasVerifiedCanary(userKey, machineId))) {
    return {
      ok: false,
      status: "blocked",
      error: "Run the write canary on Settings → API first. It proves the write path harmlessly.",
    };
  }

  // Always re-read: preview-time data is never trusted for the payload.
  let rows: Product[] = [];
  try {
    rows = await getMachineProducts(conn, machineId);
  } catch {
    return { ok: false, status: "failed", error: "Couldn't read the planogram — nothing was sent." };
  }

  const row = findRowByMachineProductId(rows, machineProductId);
  if (!row) {
    return { ok: false, status: "failed", error: "That slot is no longer in the planogram." };
  }

  const mdb = Number(row.MDBCode ?? 0);
  const { edit, errors } = parseEdit(machineProductId, mdb, raw);
  if (errors.length) return { ok: false, status: "failed", error: errors[0] };
  if (!edit) return { ok: false, status: "noop", error: "Nothing to change." };

  // Staleness: if the slot moved since the preview — someone editing in Nayax's
  // own UI, or another session — refuse rather than silently overwrite.
  const snap = snapshotSlots(rows);
  const live = snap.get(mdb);
  const livePrice = live?.price ?? null;
  const livePar = live?.par ?? null;
  if (livePrice !== expected.price || livePar !== expected.par) {
    return {
      ok: false,
      status: "stale",
      slot: live?.slot,
      liveNow: { price: livePrice, par: livePar },
      error: "This slot changed in Nayax since you previewed it. Nothing was sent.",
    };
  }

  const changes = describeChanges(rows, [edit]);
  const res = await executePlanogramPut({
    conn,
    userKey,
    machineId,
    action: "slot_change",
    beforeRows: rows,
    payload: buildRowPayload(row, edit),
    changes,
    payloadMode: `row:${machineProductId}`,
    path: PLANOGRAM_ROW_PATH(machineId, machineProductId),
  });

  revalidatePath("/dashboard/inventory");

  return {
    ok: res.status === "verified",
    status: res.status,
    httpStatus: res.httpStatus,
    responseExcerpt: res.responseExcerpt,
    auditId: res.auditId,
    diffLines: res.diff ? describeDiff(res.diff) : [],
    slot: live?.slot,
  };
}

/**
 * Undo one recorded change by writing the old values back.
 *
 * Guarded: the slot must still hold the value we wrote. If it drifted since,
 * reverting would clobber someone else's newer change, so it refuses.
 */
export async function revertSlotWrite(auditId: number): Promise<SlotApply> {
  const { userKey, conn, machineId } = await requireCtx();
  if (!dbConfigured()) return { ok: false, status: "blocked", error: "No database configured." };

  const record = await getWrite(userKey, machineId, auditId);
  if (!record) return { ok: false, status: "failed", error: "That change isn't in your log." };
  if (record.revertedById != null) {
    return { ok: false, status: "failed", error: "That change was already reverted." };
  }
  if (record.status !== "verified" && record.status !== "applied_unverified") {
    return { ok: false, status: "failed", error: "Only a change that landed can be reverted." };
  }
  const change = record.changes?.[0];
  if (!change) return { ok: false, status: "failed", error: "That record has nothing to revert." };

  let rows: Product[] = [];
  try {
    rows = await getMachineProducts(conn, machineId);
  } catch {
    return { ok: false, status: "failed", error: "Couldn't read the planogram — nothing was sent." };
  }

  const snap = snapshotSlots(rows);
  const live = snap.get(change.mdb);
  const stillOurs =
    (change.new_price == null || live?.price === change.new_price) &&
    (change.new_par == null || live?.par === change.new_par);
  if (!stillOurs) {
    return {
      ok: false,
      status: "stale",
      slot: change.slot,
      liveNow: { price: live?.price ?? null, par: live?.par ?? null },
      error: "This slot changed again since that edit. Reverting would overwrite the newer value.",
    };
  }

  // Find the row by MDB, since MachineProductID isn't stored on the change record.
  const target = rows.find((r) => Number(r.MDBCode ?? -1) === change.mdb);
  const machineProductId = target ? Number(target.MachineProductID ?? 0) : 0;
  if (!target || !machineProductId) {
    return { ok: false, status: "failed", error: "Couldn't locate that slot to revert." };
  }

  // All-or-nothing. A field we changed but whose prior value was never recorded
  // cannot be put back — SlotEdit carries numbers, so "unset" is inexpressible
  // (par is genuinely null on every slot of this machine today). Restoring only
  // the other field would report full success AND mark this write reverted,
  // permanently stranding the field we could not restore.
  const priceRestorable = change.new_price == null || change.old_price != null;
  const parRestorable = change.new_par == null || change.old_par != null;
  if (!priceRestorable || !parRestorable) {
    return {
      ok: false,
      status: "failed",
      error:
        "This edit set a value that had no previous value recorded, so it can't be undone " +
        "automatically. Set it back by hand.",
    };
  }

  const inverse: SlotEdit = { mdb: change.mdb };
  if (change.new_price != null) inverse.newPrice = change.old_price as number;
  if (change.new_par != null) inverse.newPar = change.old_par as number;
  if (inverse.newPrice === undefined && inverse.newPar === undefined) {
    return { ok: false, status: "failed", error: "That record has nothing to revert." };
  }

  const res = await executePlanogramPut({
    conn,
    userKey,
    machineId,
    action: "revert",
    beforeRows: rows,
    payload: buildRowPayload(target, inverse),
    changes: describeChanges(rows, [inverse]),
    revertsId: auditId,
    payloadMode: `row:${machineProductId}`,
    path: PLANOGRAM_ROW_PATH(machineId, machineProductId),
  });

  revalidatePath("/dashboard/inventory");

  return {
    ok: res.status === "verified",
    status: res.status,
    httpStatus: res.httpStatus,
    responseExcerpt: res.responseExcerpt,
    auditId: res.auditId,
    diffLines: res.diff ? describeDiff(res.diff) : [],
    slot: change.slot,
  };
}

export async function recentSlotWrites(): Promise<WriteLogRow[]> {
  const ctx = await getCtx();
  if (!ctx.email || !ctx.machineId) return [];
  return listRecentWrites(ctx.email, ctx.machineId, 8);
}
