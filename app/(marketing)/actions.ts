"use server";

import { sendMail } from "@/lib/mail";

const NOTIFY_TO = "johnny@futurenow.co";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InterestResult = { ok: boolean; error?: string };

export async function submitInterest(
  formData: FormData
): Promise<InterestResult> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const email = get("email");
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "A valid email is required." };
  }

  const name = get("name");
  const company = get("company");
  const fleet = get("fleet");
  const system = get("system");
  const message = get("message");

  const lines = [
    "New Vendai early-access request:",
    "",
    `Name:     ${name || "—"}`,
    `Email:    ${email}`,
    `Company:  ${company || "—"}`,
    `Fleet:    ${fleet || "—"}`,
    `System:   ${system || "—"}`,
    "",
    "Message:",
    message || "—",
  ];

  const result = await sendMail({
    to: NOTIFY_TO,
    toName: "Johnny",
    subject: `Vendai early access — ${name || email}`,
    text: lines.join("\n"),
    replyTo: email,
  });

  if (!result.ok) {
    console.error("Interest email failed:", result.error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}
