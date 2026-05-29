import "server-only";
import { cookies } from "next/headers";
import type { Machine } from "@/lib/nayax";

const SEL = "vendai_machine";

/** Resolve the active machine id: saved cookie -> connection default -> first. */
export async function getSelectedMachineId(
  machines: Machine[],
  fallback?: string,
): Promise<string> {
  const ids = machines.map((m) => String(m.MachineID));
  const saved = (await cookies()).get(SEL)?.value;
  if (saved && ids.includes(saved)) return saved;
  if (fallback && ids.includes(fallback)) return fallback;
  return ids[0] ?? fallback ?? "";
}

export async function setSelectedMachineCookie(id: string): Promise<void> {
  (await cookies()).set(SEL, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
