import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home dir confuses workspace-root inference;
  // pin Turbopack's root to this project.
  turbopack: {
    root: process.cwd(),
  },
  // Product-media uploads post the (client-downscaled) image through a server
  // action; lift the default 1MB body cap as a backstop.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  // The Vendai product page was renamed to Slovend Intelligence; keep old links working.
  async redirects() {
    return [
      { source: "/vendai", destination: "/slovend-intelligence", permanent: true },
    ];
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
