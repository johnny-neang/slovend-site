/**
 * Minimal Mailjet Send API v3.1 client.
 *
 * Auth uses HTTP Basic with a public API key + private secret key:
 *   MAIL_JET         — public API key
 *   MAIL_JET_SECRET  — private secret key
 *
 * The "From" address (noreply@futurenow.co) must be a validated sender or
 * domain in the Mailjet account, otherwise the API rejects the message.
 */

const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send";

const FROM_EMAIL = "noreply@futurenow.co";
const FROM_NAME = "Vendai";

export type MailResult = { ok: true } | { ok: false; error: string };

type SendArgs = {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export async function sendMail({
  to,
  toName,
  subject,
  text,
  replyTo,
}: SendArgs): Promise<MailResult> {
  const apiKey = process.env.MAIL_JET;
  const secretKey = process.env.MAIL_JET_SECRET;

  if (!apiKey || !secretKey) {
    return {
      ok: false,
      error:
        "Mailjet is not configured (need MAIL_JET and MAIL_JET_SECRET env vars).",
    };
  }

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const message: Record<string, unknown> = {
    From: { Email: FROM_EMAIL, Name: FROM_NAME },
    To: [{ Email: to, Name: toName ?? to }],
    Subject: subject,
    TextPart: text,
  };
  if (replyTo) message.ReplyTo = { Email: replyTo };

  let res: Response;
  try {
    res = await fetch(MAILJET_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Messages: [message] }),
    });
  } catch {
    return { ok: false, error: "Could not reach the mail service." };
  }

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.text();
      if (body) detail += ` ${body.slice(0, 300)}`;
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Mail service error: ${detail}` };
  }

  return { ok: true };
}
