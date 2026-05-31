import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";

// Served at /.well-known/oauth-protected-resource via a rewrite in next.config.ts
// (Next ignores app/.well-known dot-folders). Points MCP clients at the WorkOS
// AuthKit authorization server so they can run the OAuth "Connect" flow.
const AS = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/, "");
// Must match the Resource Indicator configured in WorkOS (the MCP endpoint URL).
const RESOURCE = process.env.MCP_RESOURCE_URL;

export const GET = protectedResourceHandler({
  authServerUrls: AS ? [AS] : [],
  ...(RESOURCE ? { resourceUrl: RESOURCE } : {}),
});
export const OPTIONS = metadataCorsOptionsRequestHandler();
