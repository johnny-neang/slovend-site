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
  productBay,
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

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_machines",
    description: "List all vending machines on the operator's account (id, name, number).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_status",
    description:
      "Connectivity & health for a machine: online state, last heartbeat, signal (RSSI), temperature, last sale times.",
    input_schema: {
      type: "object",
      properties: { machineId: { type: "string", description: "Machine ID (defaults to the selected machine)" } },
    },
  },
  {
    name: "get_sales",
    description:
      "Recent sales for a machine: total revenue and vend count, payment mix, top products, and the most recent transactions. Lynx only returns recent sales, not full history.",
    input_schema: {
      type: "object",
      properties: { machineId: { type: "string", description: "Machine ID (defaults to the selected machine)" } },
    },
  },
  {
    name: "get_alerts",
    description: "Recent alerts/events for a machine (faults, reader errors, etc.).",
    input_schema: {
      type: "object",
      properties: { machineId: { type: "string", description: "Machine ID (defaults to the selected machine)" } },
    },
  },
  {
    name: "get_inventory",
    description:
      "Planogram for a machine: selections with bay, product, price, par, and which need restock or are vended out.",
    input_schema: {
      type: "object",
      properties: { machineId: { type: "string", description: "Machine ID (defaults to the selected machine)" } },
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  conn: NayaxConn,
  defaultMachineId: string,
): Promise<string> {
  const id = String(input.machineId ?? "").trim() || defaultMachineId;
  try {
    if (name === "list_machines") {
      const ms = await listMachines(conn);
      return JSON.stringify(
        ms.slice(0, 50).map((m) => ({
          id: m.MachineID,
          name: m.MachineName,
          number: m.MachineNumber,
        })),
      );
    }
    if (name === "get_status") {
      const s = await getMachineStatus(conn, id);
      return JSON.stringify({
        machineId: id,
        online: statusOnline(s),
        lastSeen: statusLastSeen(s),
        signalRSSI: statusSignal(s),
        temperature: statusTemp(s) || null,
      });
    }
    if (name === "get_sales") {
      const sales = await getLastSales(conn, id);
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
        machineId: id,
        recentRevenue: Math.round(revenue * 100) / 100,
        recentVends: sales.length,
        paymentMix: pay,
        topProducts,
        recentTransactions: recent,
      });
    }
    if (name === "get_alerts") {
      const alerts = await getLastAlerts(conn, id);
      return JSON.stringify({
        machineId: id,
        totalRecent: alerts.length,
        recent: alerts.slice(0, 20).map((a) => ({
          event: alertText(a),
          category: alertCategory(a),
          time: alertTime(a),
        })),
      });
    }
    if (name === "get_inventory") {
      const products = await getMachineProducts(conn, id);
      const rows = products.map((p) => ({
        bay: productBay(p),
        product: productName(p) || null,
        price: productPrice(p),
        par: productPar(p),
        needsRestock: productLowStock(p),
        vendedOut: productVendedOut(p),
      }));
      return JSON.stringify({
        machineId: id,
        selections: rows.length,
        needRestock: rows.filter((r) => r.needsRestock).length,
        items: rows.slice(0, 60),
      });
    }
    return `Unknown tool: ${name}`;
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "tool failed" });
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

  const system = `You are Vendai, an assistant for vending-machine operators. You have READ-ONLY access to the operator's Nayax Lynx data via tools. The currently selected machine is "${machine.name}" (id ${machine.id}); tools default to it, but you can pass a machineId or call list_machines for fleet questions.

Guidelines:
- Use tools to ground every factual answer in live data; don't guess numbers.
- Be concise and concrete — lead with the number or the answer, then a short supporting detail.
- Money is USD unless stated. "Revenue" uses settled amounts.
- Lynx returns only recent sales (not full history); say so if asked for longer ranges — historical reports are coming.
- You cannot make changes (read-only). If asked to change something, explain what you can see and suggest the action.
- Today is ${today}.`;

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
          (block.input ?? {}) as Record<string, unknown>,
          conn,
          machine.id,
        );
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "I wasn't able to finish that — try asking a more specific question about the machine.";
}
