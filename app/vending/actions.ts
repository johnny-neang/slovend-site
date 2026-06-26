"use server";

import { sendMail } from "@/lib/mail";
import { resolveLanding, getLandingConfig } from "@/lib/landing";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FeedbackResult = { ok: boolean; error?: string };

/** Public per-machine feedback ("what would you like to see?"). Emails the
 * machine's account owner (resolved server-side from the handle); nothing stored.
 * A filled honeypot field silently drops bot submissions. */
export async function submitVendingFeedback(formData: FormData): Promise<FeedbackResult> {
  if (String(formData.get("company") ?? "").trim()) return { ok: true }; // honeypot

  const handle = String(formData.get("handle") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const product = String(formData.get("product") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { ok: false, error: "A valid email is required." };
  if (!product) return { ok: false, error: "Let us know what you'd like to see." };

  const resolved = await resolveLanding(handle);
  if (!resolved) return { ok: false, error: "This machine isn't available right now." };

  const config = await getLandingConfig(resolved.userKey, resolved.machineId);
  const label = config?.title || config?.slug || config?.machineNumber || handle;

  const text = [
    `New product request for: ${label}`,
    "",
    `Name:   ${name || "—"}`,
    `Email:  ${email}`,
    `Wants:  ${product}`,
  ].join("\n");

  const result = await sendMail({
    to: resolved.userKey,
    subject: `Machine feedback — ${label}`,
    text,
    replyTo: email,
  });

  if (!result.ok) {
    console.error("submitVendingFeedback sendMail failed:", result.error);
    return { ok: false, error: "Couldn't send right now — please try again." };
  }
  return { ok: true };
}
