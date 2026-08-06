"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { saveConnection, getConnection, deleteConnection } from "@/lib/connections";
import {
  probeReadEndpoints,
  probeWriteEndpoints,
  inspectCatalogProduct,
  type AccessResult,
} from "@/lib/api-status";
import { deleteAllUserData } from "@/lib/account";
import {
  getMachineProducts,
  getCatalogProduct,
  listCatalogProducts,
  catalogOperatorId,
  catalogName,
  catalogImage,
  productNayaxId,
  type Product,
} from "@/lib/nayax";
import { getCtx } from "@/lib/dashboard";
import { dbConfigured } from "@/lib/db";
import {
  buildFullSetPayload,
  executePlanogramPut,
  describeDiff,
  hasVerifiedCanary,
  assessWriteReadiness,
  type WriteReadiness,
} from "@/lib/planogram-writes";

async function requireUserKey(): Promise<string> {
  const session = await auth();
  const key = session?.user?.email?.toLowerCase();
  if (!key) redirect("/login");
  return key;
}

/** Update credentials from the API page. A blank token keeps the current one. */
export async function updateApiCredentials(formData: FormData) {
  const key = await requireUserKey();
  const existing = await getConnection(key);
  const base =
    String(formData.get("base") ?? "").trim() || existing?.base || "https://lynx.nayax.com";
  const token = String(formData.get("token") ?? "").trim() || existing?.token || "";
  const machineId = String(formData.get("machineId") ?? "").trim();
  if (!token) redirect("/settings/api?error=token");
  await saveConnection(key, { base, token, machineId });
  redirect("/settings/api?saved=1");
}

export async function disconnectApi() {
  const key = await requireUserKey();
  await deleteConnection(key);
  redirect("/settings/api");
}

/** On-demand probe of read endpoints for the API page's "Test access" button. */
export async function testAccess(_prev: AccessResult, _formData: FormData): Promise<AccessResult> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ran: true, rows: [], error: "Not signed in." };
  const conn = await getConnection(email);
  if (!conn) return { ran: true, rows: [], error: "No Nayax connection — add your token above first." };
  try {
    const [reads, writes, catalog] = await Promise.all([
      probeReadEndpoints(conn),
      probeWriteEndpoints(conn),
      inspectCatalogProduct(conn),
    ]);
    return { ran: true, rows: [...reads, ...writes], catalog };
  } catch (e) {
    return { ran: true, rows: [], error: e instanceof Error ? e.message : "Probe failed." };
  }
}

/* --------------------------- write canary ---------------------------- */

export type CanaryVariant = "array" | "wrapped";

export type CanaryResult = {
  ran: boolean;
  error?: string;
  machineId?: string;
  readiness?: WriteReadiness;
  variant?: CanaryVariant;
  httpStatus?: number;
  responseExcerpt?: string;
  status?: string;
  verifiedUnchanged?: boolean;
  diffLines?: string[];
  rowCount?: number;
  auditId?: number | null;
};

/**
 * Send the machine's CURRENT planogram back to Nayax unchanged, then re-read and
 * diff it.
 *
 * This is the first real write this application has ever made, and it is
 * deliberately a no-op: the payload is the planogram Lynx returned moments
 * earlier, so a success changes nothing and a failure changes nothing. What it
 * buys is the two facts we cannot learn any other way — whether Lynx accepts
 * this payload shape at all, and whether the PUT patches rows or replaces the
 * whole planogram. Slot editing stays locked until this passes.
 */
export async function runWriteCanary(
  _prev: CanaryResult,
  formData: FormData,
): Promise<CanaryResult> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ran: true, error: "Not signed in." };
  if (!dbConfigured()) {
    return {
      ran: true,
      error: "No database configured. Writes are blocked because they could not be audited.",
    };
  }

  // Resolve the target through getCtx — the SAME resolver the page used to render
  // the machine id in the confirmation prompt. Reading conn.machineId directly
  // here would ignore the machine-selector cookie, so on a multi-machine account
  // the operator could type the id they were shown and write to a different
  // machine entirely.
  const ctx = await getCtx();
  const conn = ctx.conn;
  if (!conn) return { ran: true, error: "No Nayax connection — add your token above first." };
  const machineId = ctx.machineId;
  if (!machineId) return { ran: true, error: "Couldn't determine which machine to test." };

  // Typed confirmation, mirroring the delete-account flow: the operator must name
  // the machine they are about to write to.
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== machineId) {
    return {
      ran: true,
      machineId,
      error: `Type the machine id (${machineId}) to confirm.`,
    };
  }

  const variant: CanaryVariant = formData.get("variant") === "wrapped" ? "wrapped" : "array";

  let rows: Product[] = [];
  try {
    rows = await getMachineProducts(conn, machineId);
  } catch {
    return { ran: true, machineId, error: "Couldn't read the planogram — nothing was sent." };
  }
  if (!rows.length) {
    return { ran: true, machineId, error: "Lynx returned an empty planogram — nothing was sent." };
  }

  // Pre-flight. Nayax validates every item in the payload and rejects the whole
  // request if any row has NayaxProductID 0, so sending would burn a round-trip
  // to rediscover a blocker we can already see. Report it instead.
  const readiness = assessWriteReadiness(rows);
  if (!readiness.canWrite) {
    return {
      ran: true,
      machineId,
      readiness,
      error:
        `${readiness.blockedSlots.length} of ${readiness.total} slots have no product assigned ` +
        `in Nayax. Planogram writes are rejected while any slot is unassigned, so nothing was sent.`,
    };
  }

  // Zero edits: the payload IS the current planogram.
  const { payload } = buildFullSetPayload(rows, []);
  const body = variant === "wrapped" ? { MachineProducts: payload } : payload;

  const res = await executePlanogramPut({
    conn,
    userKey: email,
    machineId,
    action: "canary",
    beforeRows: rows,
    payload: body,
    changes: null,
    payloadMode: `canary:${variant}`,
  });

  return {
    ran: true,
    machineId,
    variant,
    httpStatus: res.httpStatus,
    responseExcerpt: res.responseExcerpt,
    status: res.status,
    verifiedUnchanged: res.diff ? res.diff.identical : undefined,
    diffLines: res.diff ? describeDiff(res.diff) : [],
    rowCount: rows.length,
    auditId: res.auditId,
  };
}

/** Read-only: can Nayax accept a planogram write for the selected machine at all? */
export async function writeReadinessForCurrentMachine(): Promise<WriteReadiness | null> {
  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machineId) return null;
  try {
    return assessWriteReadiness(await getMachineProducts(ctx.conn, ctx.machineId));
  } catch {
    return null;
  }
}

export type CatalogSummary = {
  operatorId: string;
  total: number;
  withPicture: number;
  products: { id: string; name: string; dexName: string; hasPicture: boolean }[];
};

/**
 * The operator's catalog — the set of products a slot could be mapped to.
 *
 * This is the fact that decides whether dashboard slot-mapping is worth
 * building: mapping 31 slots is only meaningful if there are 31 real products
 * to map them to. Read-only.
 */
export async function catalogSummaryForCurrentMachine(): Promise<CatalogSummary | null> {
  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machineId) return null;
  try {
    // The operator id lives on the machine record; fall back to the ActorID
    // carried by any catalog product the planogram already links to.
    let operatorId = ctx.machine ? catalogOperatorId(ctx.machine) : "";
    if (!operatorId) {
      const rows = await getMachineProducts(ctx.conn, ctx.machineId);
      for (const r of rows) {
        const pid = productNayaxId(r);
        if (!pid) continue;
        const c = await getCatalogProduct(ctx.conn, pid);
        if (c) operatorId = catalogOperatorId(c);
        if (operatorId) break;
      }
    }
    if (!operatorId) return null;

    const list = await listCatalogProducts(ctx.conn, operatorId);
    const products = list.map((c) => ({
      id: String(c.NayaxProductID ?? c.ProductID ?? ""),
      name: catalogName(c),
      dexName: String(c.DEXProductName ?? ""),
      hasPicture: Boolean(catalogImage(c)),
    }));
    return {
      operatorId,
      total: products.length,
      withPicture: products.filter((p) => p.hasPicture).length,
      products: products.slice(0, 50),
    };
  } catch {
    return null;
  }
}

/** Whether this machine's write path has already been proven (gates slot editing). */
export async function canaryVerifiedForCurrentMachine(): Promise<boolean> {
  // Same resolver as runWriteCanary, so the gate is evaluated for the machine
  // the operator is actually looking at.
  const ctx = await getCtx();
  if (!ctx.email || !ctx.conn || !ctx.machineId) return false;
  return hasVerifiedCanary(ctx.email, ctx.machineId);
}

/** Permanently delete all of the signed-in user's Slovend Intelligence data, then sign out. */
export async function deleteAccount(formData: FormData) {
  const key = await requireUserKey();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    redirect("/settings?error=confirm");
  }
  await deleteAllUserData(key);
  await signOut({ redirectTo: "/" });
}
