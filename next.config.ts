import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home dir confuses workspace-root inference;
  // pin Turbopack's root to this project.
  turbopack: {
    root: process.cwd(),
  },
  // Next ignores app/.well-known dot-folders, so serve the MCP OAuth
  // protected-resource metadata from a normal route at the well-known path.
  async rewrites() {
    const metadata = "/api/oauth-protected-resource";
    return [
      // mcp-handler advertises <resourceUrl>/.well-known/oauth-protected-resource
      { source: "/api/mcp/.well-known/oauth-protected-resource", destination: metadata },
      // RFC 9728 path-insertion variant + the bare root, for clients that use them
      { source: "/.well-known/oauth-protected-resource/api/mcp", destination: metadata },
      { source: "/.well-known/oauth-protected-resource", destination: metadata },
    ];
  },
};

export default nextConfig;
