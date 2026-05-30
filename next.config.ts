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
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: "/api/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;
