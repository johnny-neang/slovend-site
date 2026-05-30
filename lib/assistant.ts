import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { type NayaxConn } from "@/lib/nayax";
import {
  type ToolCtx,
  toolListMachines,
  toolStatus,
  toolSales,
  toolAlerts,
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
    description: "Recent alerts/events for the selected machine (faults, reader errors, etc.).",
    input_schema: { type: "object", properties: {} },
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
  conn: NayaxConn,
  machineId: string,
): Promise<string> {
  // Delegate to the shared read-only operations (lib/tools.ts) so the chat and
  // the MCP server stay in lockstep. Live tools only use `conn`, so email="" is fine.
  const ctx: ToolCtx = { email: "", conn };
  try {
    let data: unknown;
    if (name === "list_machines") data = await toolListMachines(ctx);
    else if (name === "get_status") data = await toolStatus(ctx, machineId);
    else if (name === "get_sales") data = await toolSales(ctx, machineId);
    else if (name === "get_alerts") data = await toolAlerts(ctx, machineId);
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
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.HAIKU_API });
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are Vendai, an assistant for vending-machine operators. The operator's Nayax Lynx account is already connected and a machine is already selected: "${machine.name}" (id ${machine.id}). You have read-only tools that act on THAT machine — call them; never ask the user which machine, and never say you can't find the machine.

Tools: get_status, get_sales, get_alerts, get_inventory (all operate on the selected machine), and list_machines (whole fleet).

Guidelines:
- Always ground factual answers in a tool call — don't guess numbers.
- Lead with the answer/number, then a short supporting detail. Be concise.
- Money is USD; "revenue" is settled amounts. Lynx returns only recent sales (not full history) — say so if asked for longer ranges; historical reports live on the Reports tab.
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
        const out = await executeTool(block.name, conn, machine.id);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "I wasn't able to finish that — try asking a more specific question about the machine.";
}
