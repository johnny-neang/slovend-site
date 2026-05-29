"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { saveConnection, deleteConnection } from "@/lib/connections";
import { setSelectedMachineCookie } from "@/lib/selection";

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

export async function setSelectedMachine(formData: FormData) {
  await requireUserKey();
  const id = String(formData.get("machineId") ?? "").trim();
  const from = String(formData.get("from") ?? "/dashboard");
  if (id) await setSelectedMachineCookie(id);
  redirect(from.startsWith("/dashboard") ? from : "/dashboard");
}
