import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";

// Served at /.well-known/oauth-protected-resource via a rewrite in next.config.ts
// (Next ignores app/.well-known dot-folders). Points MCP clients at the WorkOS
// AuthKit authorization server so they can run the OAuth "Connect" flow.
const AS = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/, "");

export const GET = protectedResourceHandler({ authServerUrls: AS ? [AS] : [] });
export const OPTIONS = metadataCorsOptionsRequestHandler();
