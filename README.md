# Slovend

The marketing site and operator dashboard for **Slovend** — a vending business — plus **Slovend Intelligence**, an assistant that lets operators query their machines in plain language.

> **Source-available, not open source.** This repository is published for transparency and reference only. See [LICENSE](./LICENSE) — all rights reserved.

## What's here

- **Marketing site** (`app/(marketing)`) — home, about, locations, and the Slovend Intelligence product page.
- **Operator dashboard** (`app/dashboard`) — sales, inventory, alerts, reports, and tax views over an operator's vending machines.
- **Slovend Intelligence assistant** (`app/dashboard/chat`, `lib/assistant.ts`) — a chat interface backed by the Anthropic API and a set of read-only tools.
- **MCP server** (`app/api/mcp`, `lib/mcp-*`) — exposes the same machine data to MCP clients over an OAuth-protected endpoint.
- **Settings** (`app/settings`) — API connection, MCP access, and account management.

## How it connects to machines

Slovend reads machine data through the **Nayax Lynx API**. There is intentionally **no global Nayax credential** — each signed-in operator connects their *own* Lynx token from the dashboard. That token is encrypted at rest (AES-256-GCM) and saved to their profile in Postgres; it is never returned to the client, never logged, and never exposed to the AI assistant.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, React 19) on Vercel
- [Auth.js / NextAuth v5](https://authjs.dev/) with Google OAuth (private-beta allowlist)
- [Neon](https://neon.tech/) serverless Postgres
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) for the Slovend Intelligence assistant
- [Model Context Protocol](https://modelcontextprotocol.io/) via `mcp-handler`
- `pdf-lib` for report/tax/sales exports, `zod` for validation, `jose` for token handling

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### Environment

All configuration lives in `.env.local` (gitignored). See [`.env.example`](./.env.example) for the full list and inline notes. In short:

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | NextAuth session/JWT signing secret |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth web client |
| `AUTH_ALLOWLIST` | Comma-separated emails/`@domains` allowed to sign in (empty = deny all) |
| `AUTH_URL` | Canonical site URL (pins the OAuth callback host) |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting each operator's Lynx token |
| `DATABASE_URL` | Neon Postgres connection string |

No real secrets are committed to this repository — `.env.example` ships with empty placeholders only.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

---

© 2026 Slovend / FutureNow. All rights reserved.
