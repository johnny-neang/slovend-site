import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getConnection } from "@/lib/connections";
import { READ_TOOLS, type ToolArgs, type ToolCtx } from "@/lib/tools";
import { verifyToken } from "@/lib/mcp-auth";
import { logMcpCall } from "@/lib/mcp-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function errText(msg: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
    isError: true,
  };
}

function emailFrom(extra: unknown): string | null {
  const e = (extra as { authInfo?: { extra?: { email?: unknown } } })?.authInfo?.extra?.email;
  return typeof e === "string" && e ? e : null;
}

function clientIdFrom(extra: unknown): string {
  const c = (extra as { authInfo?: { clientId?: unknown } })?.authInfo?.clientId;
  return typeof c === "string" && c ? c : "unknown";
}

const base = createMcpHandler(
  (server) => {
    for (const tool of READ_TOOLS) {
      server.tool(tool.name, tool.description, tool.shape, async (args: ToolArgs, extra: unknown) => {
        const email = emailFrom(extra);
        if (!email) return errText("Not authenticated.");
        const conn = await getConnection(email);
        if (!conn) {
          return errText(
            "No Nayax connection found for your account — connect it in the Slovend Intelligence dashboard first.",
          );
        }
        try {
          const data = await tool.run({ email, conn } as ToolCtx, args);
          void logMcpCall(email, tool.name, clientIdFrom(extra));
          return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
        } catch (e) {
          return errText(e instanceof Error ? e.message : "tool failed");
        }
      });
    }
  },
  {},
  { basePath: "/api" },
);

const handler = withMcpAuth(base, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
  ...(process.env.MCP_RESOURCE_URL ? { resourceUrl: process.env.MCP_RESOURCE_URL } : {}),
});

export { handler as GET, handler as POST, handler as DELETE };
