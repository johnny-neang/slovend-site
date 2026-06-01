import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/dashboard";
import { getMcpStatus } from "@/lib/mcp-activity";
import { READ_TOOLS } from "@/lib/tools";
import CopyField from "@/components/CopyField";

export const metadata: Metadata = { title: "MCP · Vendai" };
export const dynamic = "force-dynamic";

function whenUTC(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(d).concat(" UTC");
}

export default async function McpPage() {
  const ctx = await getCtx();
  const connected = Boolean(ctx.conn);
  const configured = Boolean(process.env.WORKOS_AUTHKIT_DOMAIN);
  const url = process.env.MCP_RESOURCE_URL || "https://www.slovend.com/api/mcp";
  const status = ctx.email ? await getMcpStatus(ctx.email) : null;
  const used = (status?.totalCalls ?? 0) > 0;

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Vendai · Integration</div>
            <h1 className="serif-display">Connect your AI</h1>
          </div>
          <span className={`status ${configured ? "live" : "off"}`}>
            <span className="dot" />
            {configured ? "MCP available" : "Coming soon"}
          </span>
        </div>

        <p className="mcp-intro">
          Vendai speaks <strong>MCP</strong> (Model Context Protocol) — the open standard
          that lets you plug this data into your own AI. Connect <strong>ChatGPT</strong>,{" "}
          <strong>Claude</strong>, or any MCP client and ask about your machines, sales,
          reports and tax in plain language. It&apos;s <strong>read-only</strong> and scoped to
          your account — your AI only ever sees your own data.
        </p>

        <div className="dash-mock" style={{ marginBottom: 20 }}>
          <div className="tiles tiles-4">
            <div className="tile">
              <div className="l">MCP endpoint</div>
              <div className="n" style={{ fontSize: 22 }}>{configured ? "Live" : "—"}</div>
              <div className="d">{configured ? "ready to connect" : "not configured"}</div>
            </div>
            <div className="tile">
              <div className="l">Your Nayax data</div>
              <div className="n" style={{ fontSize: 22 }}>{connected ? "Connected" : "Not yet"}</div>
              <div className="d">
                {connected ? "tokens encrypted" : "connect on Overview"}
              </div>
            </div>
            <div className="tile">
              <div className="l">AI activity · 7d</div>
              <div className="n">{status?.last7d ?? 0}</div>
              <div className="d">{used ? `${status?.totalCalls} total calls` : "no calls yet"}</div>
            </div>
            <div className="tile">
              <div className="l">Last used</div>
              <div className="n" style={{ fontSize: 18 }}>{used ? whenUTC(status?.lastCall ?? null) : "—"}</div>
              <div className="d">{used && status?.lastClient ? `client ${status.lastClient.slice(0, 14)}` : "via your AI client"}</div>
            </div>
          </div>
        </div>

        {!connected && (
          <p className="tax-hint">
            Connect your Nayax account on the{" "}
            <Link href="/dashboard">Overview</Link> first — your AI reads through that connection,
            so tools return no data until it&apos;s set.
          </p>
        )}

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-h">Connect in a minute</div>
          <p className="mcp-sub">Your connector URL — paste this into your AI client:</p>
          <CopyField value={url} />
          <ol className="mcp-steps">
            <li>
              <b>Claude.ai:</b> Settings → Connectors → <em>Add custom connector</em> → paste the URL → <em>Connect</em>.
            </li>
            <li>
              <b>ChatGPT:</b> Settings → Connectors (Developer mode) → add the URL → <em>Connect</em>.
            </li>
            <li>
              A sign-in window opens — <b>sign in with Google</b> using your Vendai email
              (the same account your machines are under), then approve access.
            </li>
            <li>
              In a chat, enable the Vendai connector and ask, e.g.{" "}
              <em>&ldquo;list my machines&rdquo;</em> or{" "}
              <em>&ldquo;how did my machine do over the last 7 days?&rdquo;</em>
            </li>
          </ol>
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-h">What your AI can do ({READ_TOOLS.length} tools)</div>
          <div className="tool-list">
            {READ_TOOLS.map((t) => (
              <div className="tool-row" key={t.name}>
                <code className="tool-name">{t.name}</code>
                <span className="tool-desc">{t.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">Good to know</div>
          <ul className="mcp-notes">
            <li><b>Read-only.</b> These tools can view your data but never change anything.</li>
            <li><b>Your data only.</b> Every request is tied to your sign-in — one operator can never see another&apos;s machines.</li>
            <li><b>Revoke anytime.</b> Remove the connector in your AI client, or disconnect Nayax on the Overview, and access stops immediately.</li>
            <li><b>Secrets stay here.</b> Your Nayax token is never exposed to the AI; tools return data, not credentials.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
