"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { saveConnection, deleteConnection, getConnection } from "@/lib/connections";
import { setSelectedMachineCookie } from "@/lib/selection";
import { probeReadEndpoints, type AccessResult } from "@/lib/api-status";

async function requireUserKey(): Promise<string> {
  const session = await auth();
  const key = session?.user?.email?.toLowerCase();
  if (!key) redirect("/login");
  return key;
}

export async function connectNayax(formData: FormData) {
  const key = await requireUserKey();

  const base =
    String(formData.get("base") ?? "").trim() || "https://lynx.nayax.com";
  const token = String(formData.get("token") ?? "").trim();
  const machineId = String(formData.get("machineId") ?? "").trim();

  if (!token) redirect("/dashboard?error=token");

  await saveConnection(key, { base, token, machineId });
  redirect("/dashboard");
}

export async function disconnectNayax() {
  const key = await requireUserKey();
  await deleteConnection(key);
  redirect("/dashboard");
}

/** Update credentials from the API page. A blank token keeps the current one,
 * so the base URL / default machine can be changed without re-entering the key. */
export async function updateApiCredentials(formData: FormData) {
  const key = await requireUserKey();
  const existing = await getConnection(key);
  const base =
    String(formData.get("base") ?? "").trim() || existing?.base || "https://lynx.nayax.com";
  const token = String(formData.get("token") ?? "").trim() || existing?.token || "";
  const machineId = String(formData.get("machineId") ?? "").trim();
  if (!token) redirect("/dashboard/api?error=token");
  await saveConnection(key, { base, token, machineId });
  redirect("/dashboard/api?saved=1");
}

export async function disconnectApi() {
  const key = await requireUserKey();
  await deleteConnection(key);
  redirect("/dashboard/api");
}

/** On-demand probe of read endpoints for the API page's "Test access" button. */
export async function testAccess(_prev: AccessResult, _formData: FormData): Promise<AccessResult> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ran: true, rows: [], error: "Not signed in." };
  const conn = await getConnection(email);
  if (!conn) return { ran: true, rows: [], error: "No Nayax connection — add your token above first." };
  try {
    return { ran: true, rows: await probeReadEndpoints(conn) };
  } catch (e) {
    return { ran: true, rows: [], error: e instanceof Error ? e.message : "Probe failed." };
  }
}

export async function setSelectedMachine(formData: FormData) {
  await requireUserKey();
  const id = String(formData.get("machineId") ?? "").trim();
  const from = String(formData.get("from") ?? "/dashboard");
  if (id) await setSelectedMachineCookie(id);
  redirect(from.startsWith("/dashboard") ? from : "/dashboard");
}
