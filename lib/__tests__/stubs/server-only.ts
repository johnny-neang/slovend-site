// Stub for the `server-only` package under vitest. The real module throws when
// imported outside a React server-component graph, which would block unit tests
// of otherwise-pure server helpers. Aliased in vitest.config.ts only — the real
// package still guards the actual Next.js build.
export {};
