"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const COOKIE = "nayax_conn";

export async function connectNayax(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const base =
    String(formData.get("base") ?? "").trim() || "https://lynx.nayax.com";
  const token = String(formData.get("token") ?? "").trim();
  const machineId = String(formData.get("machineId") ?? "").trim();

  if (!token) redirect("/dashboard?error=token");

  (await cookies()).set(COOKIE, JSON.stringify({ base, token, machineId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect("/dashboard");
}

export async function disconnectNayax() {
  (await cookies()).delete(COOKIE);
  redirect("/dashboard");
}
