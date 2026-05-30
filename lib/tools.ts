import "server-only";
import { z } from "zod";
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
import { reportSummary } from "@/lib/reports";
import { taxReport, getTaxSettings } from "@/lib/tax";
import { salesForExport } from "@/lib/exports";
import { resolveWindow } from "@/lib/window";
import { getMachineTimezone } from "@/lib/settings";

/**
 * Canonical read-only Vendai operations, shared by the in-app Haiku chat
 * (lib/assistant.ts) and the remote MCP server (app/api/mcp). `email` is the
 * operator's userKey; `conn` is their decrypted Nayax connection.
 */
export type ToolCtx = { email: string; conn: NayaxConn };
export type ToolArgs = { machineId?: string; range?: string; from?: string; to?: string };

async function resolveMachineId(ctx: ToolCtx, id?: string): Promise<string> {
  if (id) return id;
  if (ctx.conn.machineId) return ctx.conn.machineId;
  const ms = await listMachines(ctx.conn);
  return ms[0]?.MachineID != null ? String(ms[0].MachineID) : "";
}

export async function toolListMachines(ctx: ToolCtx) {
  const ms = await listMachines(ctx.conn);
  return ms
    .slice(0, 100)
    .map((m) => ({ id: m.MachineID, name: m.MachineName, number: m.MachineNumber }));
}

export async function toolStatus(ctx: ToolCtx, id?: string) {
  const machineId = await resolveMachineId(ctx, id);
  const s = await getMachineStatus(ctx.conn, machineId);
  return {
    machineId,
    online: statusOnline(s),
    lastSeen: statusLastSeen(s),
    signalRSSI: statusSignal(s),
    temperature: statusTemp(s) || null,
  };
}

export async function toolSales(ctx: ToolCtx, id?: string) {
  const machineId = await resolveMachineId(ctx, id);
  const sales = await getLastSales(ctx.conn, machineId);
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
  return {
    machineId,
    recentRevenue: Math.round(revenue * 100) / 100,
    recentVends: sales.length,
    paymentMix: pay,
    topProducts,
    recentTransactions: recent,
    note: "Lynx returns only recent sales, not full history. Use get_report for compiled history.",
  };
}

export async function toolAlerts(ctx: ToolCtx, id?: string) {
  const machineId = await resolveMachineId(ctx, id);
  const alerts = await getLastAlerts(ctx.conn, machineId);
  return {
    machineId,
    totalRecent: alerts.length,
    recent: alerts.slice(0, 20).map((a) => ({
      event: alertText(a),
      category: alertCategory(a),
      time: alertTime(a),
    })),
  };
}

export async function toolInventory(ctx: ToolCtx, id?: string) {
  const machineId = await resolveMachineId(ctx, id);
  const products = await getMachineProducts(ctx.conn, machineId);
  const rows = products.map((p) => ({
    slot: productSlot(p),
    product: productName(p) || null,
    price: productPrice(p),
    par: productPar(p),
    needsRestock: productLowStock(p),
    vendedOut: productVendedOut(p),
  }));
  return {
    machineId,
    selections: rows.length,
    needRestock: rows.filter((r) => r.needsRestock).length,
    items: rows.slice(0, 80),
  };
}

export async function toolReport(ctx: ToolCtx, args: ToolArgs) {
  const machineId = await resolveMachineId(ctx, args.machineId);
  const win = resolveWindow({ range: args.range, from: args.from, to: args.to });
  const tz = await getMachineTimezone(ctx.email, machineId);
  const r = await reportSummary(ctx.email, machineId, win, tz);
  return { machineId, window: win.label, timezone: tz, ...r };
}

export async function toolTax(ctx: ToolCtx, args: ToolArgs) {
  const machineId = await resolveMachineId(ctx, args.machineId);
  const win = resolveWindow({ range: args.range, from: args.from, to: args.to });
  const tz = await getMachineTimezone(ctx.email, machineId);
  const settings = await getTaxSettings(ctx.email, machineId);
  const r = await taxReport(ctx.email, machineId, win, settings, tz);
  return {
    machineId,
    window: win.label,
    timezone: tz,
    ratePct: settings.ratePct,
    taxablePct: settings.taxablePct,
    inclusive: settings.inclusive,
    ...r,
    disclaimer:
      "Estimate based on the operator's configured rate and taxable %. Not tax advice; covers only sales recorded by Vendai in the window.",
  };
}

export async function toolExport(ctx: ToolCtx, args: ToolArgs) {
  const machineId = await resolveMachineId(ctx, args.machineId);
  const win = resolveWindow({ range: args.range, from: args.from, to: args.to });
  const tz = await getMachineTimezone(ctx.email, machineId);
  const rows = await salesForExport(ctx.email, machineId, win, tz);
  return { machineId, window: win.label, timezone: tz, count: rows.length, rows: rows.slice(0, 1000) };
}

const machineArg = {
  machineId: z
    .string()
    .optional()
    .describe("Numeric machine id (from list_machines). Defaults to your primary machine."),
};
const rangeArgs = {
  ...machineArg,
  range: z.enum(["7", "30", "90"]).optional().describe("Preset window length in days (default 30)."),
  from: z.string().optional().describe("Start date YYYY-MM-DD (use with `to` for a custom range)."),
  to: z.string().optional().describe("End date YYYY-MM-DD, inclusive."),
};

/** Tool registry consumed by the MCP server. */
export const READ_TOOLS: {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  run: (ctx: ToolCtx, args: ToolArgs) => Promise<unknown>;
}[] = [
  {
    name: "list_machines",
    description: "List the vending machines on your Nayax account (id, name, number).",
    shape: {},
    run: (ctx) => toolListMachines(ctx),
  },
  {
    name: "get_machine_status",
    description: "Connectivity & health of a machine: online state, last heartbeat, signal (RSSI), temperature.",
    shape: machineArg,
    run: (ctx, a) => toolStatus(ctx, a.machineId),
  },
  {
    name: "get_recent_sales",
    description:
      "Recent live sales for a machine: revenue, vend count, payment mix, top products, latest transactions. Lynx returns only recent sales — use get_report for compiled history.",
    shape: machineArg,
    run: (ctx, a) => toolSales(ctx, a.machineId),
  },
  {
    name: "get_inventory",
    description: "Planogram for a machine: slot, product, price, par, and which need restock or are vended out.",
    shape: machineArg,
    run: (ctx, a) => toolInventory(ctx, a.machineId),
  },
  {
    name: "get_alerts",
    description: "Recent alerts/events for a machine (faults, reader errors, etc.).",
    shape: machineArg,
    run: (ctx, a) => toolAlerts(ctx, a.machineId),
  },
  {
    name: "get_report",
    description:
      "Compiled sales history for a machine over a window (totals, daily revenue, top products, payment mix, sales-by-hour), in the machine's local timezone.",
    shape: rangeArgs,
    run: (ctx, a) => toolReport(ctx, a),
  },
  {
    name: "get_tax_summary",
    description:
      "Sales-tax summary for a machine over a window (gross, taxable, tax, net, by period) using the operator's saved tax settings. Estimate only.",
    shape: rangeArgs,
    run: (ctx, a) => toolTax(ctx, a),
  },
  {
    name: "export_sales",
    description: "Raw recorded transactions for a machine over a window (time, slot, product, amount, currency, payment).",
    shape: rangeArgs,
    run: (ctx, a) => toolExport(ctx, a),
  },
];
