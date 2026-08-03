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

/** Permanently delete all of the signed-in user's Slovend Intelligence data, then sign out. */
export async function deleteAccount(formData: FormData) {
  const key = await requireUserKey();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    redirect("/settings?error=confirm");
  }
  await deleteAllUserData(key);
  await signOut({ redirectTo: "/" });
}
