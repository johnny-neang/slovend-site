import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { type NayaxConn } from "@/lib/nayax";
import {
  type ToolCtx,
  type ToolArgs,
  toolListMachines,
  toolStatus,
  toolSales,
  toolAlerts,
  toolAlertHistory,
  toolInventory,
} from "@/lib/tools";

const MODEL = "claude-haiku-4-5";

export function assistantConfigured(): boolean {
  return Boolean(process.env.HAIKU_API);
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

// All per-machine tools operate on the already-selected machine — no machineId
// argument for the model to get wrong.
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_status",
    description:
      "Connectivity & health of the selected machine: online state, last heartbeat, signal (RSSI), temperature.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_sales",
    description:
      "Recent sales for the selected machine: total revenue and vend count, payment mix, top products, and the most recent transactions. Lynx returns only recent sales, not full history.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_alerts",
    description:
      "Recent LIVE alerts/events for the selected machine (faults, reader errors, etc.) from Lynx's recent window. For history/search over a date range, use get_alert_history.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_alert_history",
    description:
      "Compiled alert/event history recorded by Vendai for the selected machine over a date window, with totals by severity and category and text search. Use this to investigate or diagnose past events (e.g. 'reader faults in the last 30 days').",
    input_schema: {
      type: "object",
      properties: {
        range: { type: "string", enum: ["7", "30", "90"], description: "Preset window length in days (default 30)." },
        from: { type: "string", description: "Start date YYYY-MM-DD (use with `to` for a custom range)." },
        to: { type: "string", description: "End date YYYY-MM-DD, inclusive." },
        q: { type: "string", description: "Text search over event description and category." },
        severity: { type: "string", enum: ["high", "med", "low"], description: "Filter by severity." },
        category: { type: "string", description: "Filter by exact event category." },
      },
    },
  },
  {
    name: "get_inventory",
    description:
      "Planogram for the selected machine: selections with slot, product, price, par, and which need restock or are vended out.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_machines",
    description: "List all vending machines on the operator's account (id, name, number).",
    input_schema: { type: "object", properties: {} },
  },
];

async function executeTool(
  name: string,
  ctx: ToolCtx,
  machineId: string,
  input: ToolArgs,
): Promise<string> {
  // Delegate to the shared read-only operations (lib/tools.ts) so the chat and
  // the MCP server stay in lockstep. Live tools only need `conn`; DB-backed
  // history (get_alert_history) also uses ctx.email as the user key.
  try {
    let data: unknown;
    if (name === "list_machines") data = await toolListMachines(ctx);
    else if (name === "get_status") data = await toolStatus(ctx, machineId);
    else if (name === "get_sales") data = await toolSales(ctx, machineId);
    else if (name === "get_alerts") data = await toolAlerts(ctx, machineId);
    else if (name === "get_alert_history")
      data = await toolAlertHistory(ctx, { ...input, machineId });
    else if (name === "get_inventory") data = await toolInventory(ctx, machineId);
    else return `Unknown tool: ${name}`;
    return JSON.stringify(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "tool failed";
    console.warn(`[assistant] tool ${name} failed for machine ${machineId}: ${msg}`);
    return JSON.stringify({ error: msg, machineId });
  }
}

export async function runAssistant(
  conn: NayaxConn,
  machine: { id: string; name: string },
  history: ChatTurn[],
  userText: string,
  email = "",
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.HAIKU_API });
  const ctx: ToolCtx = { email, conn };
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are Vendai, an assistant for vending-machine operators. The operator's Nayax Lynx account is already connected and a machine is already selected: "${machine.name}" (id ${machine.id}). You have read-only tools that act on THAT machine — call them; never ask the user which machine, and never say you can't find the machine.

Tools: get_status, get_sales, get_alerts, get_alert_history, get_inventory (all operate on the selected machine), and list_machines (whole fleet).

Guidelines:
- Always ground factual answers in a tool call — don't guess numbers.
- Lead with the answer/number, then a short supporting detail. Be concise.
- Money is USD; "revenue" is settled amounts. Lynx returns only recent sales (not full history) — say so if asked for longer ranges; historical reports live on the Reports tab.
- For alerts: get_alerts is the live recent window; get_alert_history searches saved events over a date range (supports q/severity/category) — use it to diagnose or count past faults.
- If a tool returns an {"error": ...}, briefly tell the user what the error said (e.g. a connectivity or permissions issue) instead of claiming the machine doesn't exist.
- You are read-only and cannot make changes. Today is ${today}.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.MessageParam),
    { role: "user", content: userText },
  ];

  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: TOOLS,
      messages,
    });

    if (res.stop_reason !== "tool_use") {
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    messages.push({ role: "assistant", content: res.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const out = await executeTool(
          block.name,
          ctx,
          machine.id,
          (block.input ?? {}) as ToolArgs,
        );
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "I wasn't able to finish that — try asking a more specific question about the machine.";
}
