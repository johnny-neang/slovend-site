import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { isAllowed } from "@/lib/allowlist";

/**
 * Verifies the bearer token on an MCP request and resolves it to an operator
 * email (our userKey). The OAuth Authorization Server is WorkOS AuthKit, federated
 * to Google — so a valid token implies a `@futurenow.co` Google login; we re-check
 * the allowlist here as defense-in-depth. Returns undefined → mcp-handler responds
 * 401 with the protected-resource-metadata pointer.
 *
 * Env (set after the WorkOS spike):
 *   WORKOS_AUTHKIT_DOMAIN  e.g. https://your-app.authkit.app   (issuer / AS base)
 *   WORKOS_JWKS_URL        defaults to `${WORKOS_AUTHKIT_DOMAIN}/oauth2/jwks`
 *   WORKOS_EMAIL_CLAIM     claim holding the email (default "email")
 *   WORKOS_API_KEY         optional — used to look up email if not in the token
 */
const AS_URL = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/, "");
const JWKS_URL = process.env.WORKOS_JWKS_URL || (AS_URL ? `${AS_URL}/oauth2/jwks` : undefined);
const EMAIL_CLAIM = process.env.WORKOS_EMAIL_CLAIM || "email";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks && JWKS_URL) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

async function lookupEmail(userId: string): Promise<string> {
  if (!process.env.WORKOS_API_KEY) return "";
  try {
    const { WorkOS } = await import("@workos-inc/node");
    const workos = new WorkOS(process.env.WORKOS_API_KEY);
    const user = await workos.userManagement.getUser(userId);
    return user.email ?? "";
  } catch {
    return "";
  }
}

function authFor(email: string, token: string, clientId: string, exp?: number): AuthInfo | undefined {
  const e = email.toLowerCase();
  if (!e || !isAllowed(e)) return undefined;
  return { token, clientId, scopes: ["mcp:read"], expiresAt: exp, extra: { email: e } };
}

export async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;

  // Dev escape hatch so the tools can be exercised on a PREVIEW before WorkOS is
  // wired. Never honored in production, even if the env var were set there.
  if (
    process.env.VERCEL_ENV !== "production" &&
    process.env.MCP_DEV_TOKEN &&
    bearer === process.env.MCP_DEV_TOKEN
  ) {
    return authFor(process.env.MCP_DEV_EMAIL || "", bearer, "dev");
  }

  const set = getJwks();
  if (!set || !AS_URL) return undefined; // provider not configured yet → 401

  try {
    const { payload } = await jwtVerify(bearer, set, { issuer: AS_URL });
    let email = typeof payload[EMAIL_CLAIM] === "string" ? (payload[EMAIL_CLAIM] as string) : "";
    if (!email && typeof payload.sub === "string") email = await lookupEmail(payload.sub);
    const clientId = typeof payload.azp === "string" ? payload.azp : "workos";
    const exp = typeof payload.exp === "number" ? payload.exp : undefined;
    return authFor(email, bearer, clientId, exp);
  } catch {
    return undefined;
  }
}
