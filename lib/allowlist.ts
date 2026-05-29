/**
 * Email allowlist for the private beta.
 * AUTH_ALLOWLIST is a comma-separated list of exact emails and/or @domains, e.g.
 *   "johnny@uppercloud.com,@futurenow.co,@slovend.com"
 * If unset/empty, access is CLOSED (nobody is allowed) — fail safe for a private beta.
 */
export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(
  email: string | null | undefined,
  raw: string | undefined = process.env.AUTH_ALLOWLIST,
): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const list = parseAllowlist(raw);
  if (list.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[auth] AUTH_ALLOWLIST is empty — all sign-ins will be denied. Set it to allow access.",
      );
    }
    return false;
  }
  return list.some((a) => (a.startsWith("@") ? e.endsWith(a) : a === e));
}
