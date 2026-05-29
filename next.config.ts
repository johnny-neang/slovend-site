import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home dir confuses workspace-root inference;
  // pin Turbopack's root to this project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
