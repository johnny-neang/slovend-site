import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests cover the pure, safety-critical helpers only — slot/MDB decoding and
 * the sale-noise predicate today, the planogram write pipeline next. Nothing here
 * touches Neon, Nayax, or React: those paths are verified on deploy (local dev has
 * no DATABASE_URL and no OAuth credentials).
 *
 * `server-only` is stubbed because the modules under test are server modules and
 * that package throws by design when imported outside a server component graph.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./lib/__tests__/stubs/server-only.ts", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
});
