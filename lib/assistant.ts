import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  type NayaxConn,
  listMachines,
  getMachineStatus,
  getLastSales,
  getLastAlerts,
  getMachineProducts,
  saleAmount,
  saleLabel,
  saleTime,
  salePayment,
  alertText,
  alertTime,
  alertCategory,
  productName,
  productSlot,
  productPrice,
  productPar,
  productLowStock,
  productVendedOut,
  statusOnline,
  statusLastSeen,
  statusSignal,
  statusTemp,
} from "@/lib/nayax";

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
  try {
    if (name === "list_machines") {
      const ms = await listMachines(conn);
      return JSON.stringify(
        ms.slice(0, 50).map((m) => ({ id: m.MachineID, name: m.MachineName, number: m.MachineNumber })),
      );
    }
    if (name === "get_status") {
      const s = await getMachineStatus(conn, machineId);
      return JSON.stringify({
        machineId,
        online: statusOnline(s),
        lastSeen: statusLastSeen(s),
        signalRSSI: statusSignal(s),
        temperature: statusTemp(s) || null,
      });
    }
    if (name === "get_sales") {
      const sales = await getLastSales(conn, machineId);
      const revenue = sales.reduce((a, s) => a + saleAmount(s), 0);
      const pay: Record<string, number> = {};
      const prod: Record<string, { count: number; revenue: number }> = {};
      for (const s of sales) {
        const p = salePayment(s) || "Unknown";
        pay[p] = (pay[p] ?? 0) + 1;
        const n = saleLabel(s);
        prod[n] = prod[n] ?? { count: 0, revenue: 0 };
        prod[n].count += 1;
        prod[n].revenue += saleAmount(s);
      }
      const topProducts = Object.entries(prod)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 8)
        .map(([name, v]) => ({ name, ...v }));
      const recent = sales.slice(0, 15).map((s) => ({
        product: saleLabel(s),
        amount: saleAmount(s),
        payment: salePayment(s),
        time: saleTime(s),
      }));
      return JSON.stringify({
        machineId,
        recentRevenue: Math.round(revenue * 100) / 100,
        recentVends: sales.length,
        paymentMix: pay,
        topProducts,
        recentTransactions: recent,
      });
    }
    if (name === "get_alerts") {
      const alerts = await getLastAlerts(conn, machineId);
      return JSON.stringify({
        machineId,
        totalRecent: alerts.length,
        recent: alerts.slice(0, 20).map((a) => ({
          event: alertText(a),
          category: alertCategory(a),
          time: alertTime(a),
        })),
      });
    }
    if (name === "get_inventory") {
      const products = await getMachineProducts(conn, machineId);
      const rows = products.map((p) => ({
        slot: productSlot(p),
        product: productName(p) || null,
        price: productPrice(p),
        par: productPar(p),
        needsRestock: productLowStock(p),
        vendedOut: productVendedOut(p),
      }));
      return JSON.stringify({
        machineId,
        selections: rows.length,
        needRestock: rows.filter((r) => r.needsRestock).length,
        items: rows.slice(0, 60),
      });
    }
    return `Unknown tool: ${name}`;
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
