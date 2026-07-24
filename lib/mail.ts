/**
 * Minimal Mailjet client — Send API v3.1 (transactional email) plus the
 * Contacts REST API v3 (storing the early-access mailing list).
 *
 * Auth uses HTTP Basic with a public API key + private secret key:
 *   MAIL_JET         — public API key
 *   MAIL_JET_SECRET  — private secret key
 *
 * The "From" address (noreply@futurenow.co) must be a validated sender or
 * domain in the Mailjet account, otherwise the Send API rejects the message.
 *
 * MAILJET_CONTACT_LIST_ID — id of the Mailjet contact list that early-access
 * signups are stored in (Mailjet dashboard → Contacts → Contact lists). When
 * unset, storing is skipped (the notification email still goes out).
 */

const MAILJET_SEND_ENDPOINT = "https://api.mailjet.com/v3.1/send";
const MAILJET_REST = "https://api.mailjet.com/v3/REST";

const FROM_EMAIL = "noreply@futurenow.co";
const FROM_NAME = "Slovend Intelligence";

export type MailResult = { ok: true } | { ok: false; error: string };

/** Basic-auth header value from the Mailjet key pair, or null if unconfigured. */
function mailjetAuth(): string | null {
  const apiKey = process.env.MAIL_JET;
  const secretKey = process.env.MAIL_JET_SECRET;
  if (!apiKey || !secretKey) return null;
  return `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`;
}

/** Read up to 300 chars of an error response body for logging context. */
async function errorDetail(res: Response): Promise<string> {
  let detail = `${res.status}`;
  try {
    const body = await res.text();
    if (body) detail += ` ${body.slice(0, 300)}`;
  } catch {
    /* ignore */
  }
  return detail;
}

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
  const auth = mailjetAuth();
  if (!auth) {
    return {
      ok: false,
      error:
        "Mailjet is not configured (need MAIL_JET and MAIL_JET_SECRET env vars).",
    };
  }

  const message: Record<string, unknown> = {
    From: { Email: FROM_EMAIL, Name: FROM_NAME },
    To: [{ Email: to, Name: toName ?? to }],
    Subject: subject,
    TextPart: text,
  };
  if (replyTo) message.ReplyTo = { Email: replyTo };

  let res: Response;
  try {
    res = await fetch(MAILJET_SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Messages: [message] }),
    });
  } catch {
    return { ok: false, error: "Could not reach the mail service." };
  }

  if (!res.ok) {
    return { ok: false, error: `Mail service error: ${await errorDetail(res)}` };
  }

  return { ok: true };
}

/** `stored: false` means Mailjet is reachable but no contact list is configured. */
export type ContactResult =
  | { ok: true; stored: boolean }
  | { ok: false; error: string };

type ContactArgs = {
  email: string;
  name?: string;
};

/**
 * Add (or re-affirm) a contact on the early-access mailing list via Mailjet's
 * Contacts API. Uses `addnoforce`, which subscribes the contact but respects a
 * prior unsubscribe — safe to call again on repeat submissions.
 */
export async function addContactToList({
  email,
  name,
}: ContactArgs): Promise<ContactResult> {
  const auth = mailjetAuth();
  if (!auth) {
    return {
      ok: false,
      error:
        "Mailjet is not configured (need MAIL_JET and MAIL_JET_SECRET env vars).",
    };
  }

  const listId = process.env.MAILJET_CONTACT_LIST_ID;
  if (!listId) {
    // No list to store to — not an error; the caller still sends the notification.
    return { ok: true, stored: false };
  }

  let res: Response;
  try {
    res = await fetch(
      `${MAILJET_REST}/contactslist/${encodeURIComponent(listId)}/managecontact`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Email: email,
          Name: name || undefined,
          Action: "addnoforce",
        }),
      }
    );
  } catch {
    return { ok: false, error: "Could not reach the Mailjet contacts API." };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Mailjet contacts error: ${await errorDetail(res)}`,
    };
  }

  return { ok: true, stored: true };
}
