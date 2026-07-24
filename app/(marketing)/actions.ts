"use server";

import { addContactToList, sendMail } from "@/lib/mail";

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
    "New Slovend Intelligence early-access request:",
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

  // Store the signup on the Mailjet mailing list and notify Johnny. Independent,
  // so run them together; the submission succeeds as long as the lead is captured
  // by at least one (stored on the list, or delivered in the notification email).
  const [stored, notified] = await Promise.all([
    addContactToList({ email, name }),
    sendMail({
      to: NOTIFY_TO,
      toName: "Johnny",
      subject: `Slovend Intelligence early access — ${name || email}`,
      text: lines.join("\n"),
      replyTo: email,
    }),
  ]);

  if (!stored.ok) console.error("Interest contact store failed:", stored.error);
  if (!notified.ok) console.error("Interest email failed:", notified.error);

  const capturedOnList = stored.ok && stored.stored;
  if (!capturedOnList && !notified.ok) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}
