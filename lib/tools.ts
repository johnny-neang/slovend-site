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
  saleSlot,
  saleTime,
  salePayment,
  isAuthNoise,
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
import { alertsSummary, type Severity } from "@/lib/alerts";
import { resolveWindow } from "@/lib/window";
import { getMachineTimezone } from "@/lib/settings";
import { rssiScaleOf, rssiQuality, isUnknownRssi, RSSI_UNIT } from "@/lib/rssi";

/**
 * Canonical read-only Slovend Intelligence operations, shared by the in-app Haiku chat
 * (lib/assistant.ts) and the remote MCP server (app/api/mcp). `email` is the
 * operator's userKey; `conn` is their decrypted Nayax connection.
 */
export type ToolCtx = { email: string; conn: NayaxConn };
export type ToolArgs = {
  machineId?: string;
  range?: string;
  from?: string;
  to?: string;
  q?: string;
  severity?: string;
  category?: string;
};

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
  const rssi = statusSignal(s);

  // Classify the signal so the assistant can say "signal is Poor" rather than
  // quoting a bare number. Nayax sends the 3GPP AT+CSQ index (0–31; 99 = no
  // signal); a negative reading would be dBm. See lib/rssi.ts.
  let signalQuality: string | null = null;
  let signalScale: string | null = null;
  if (rssi != null) {
    if (isUnknownRssi(rssi)) {
      signalQuality = "No signal";
    } else {
      const scale = rssiScaleOf([rssi]);
      signalScale = RSSI_UNIT[scale];
      signalQuality = rssiQuality(rssi, scale)?.quality ?? null;
    }
  }

  return {
    machineId,
    online: statusOnline(s),
    lastSeen: statusLastSeen(s),
    signalRSSI: rssi,
    signalScale, // "CSQ" (0–31) or "dBm"
    signalQuality, // Excellent | Good | Fair | Poor | No signal
    temperature: statusTemp(s) || null,
    signalNote:
      "RSSI is the cellular AT+CSQ index 0–31 (higher is better); healthy is 15+, investigate below ~10. 99/none means no signal.",
  };
}

export async function toolSales(ctx: ToolCtx, id?: string) {
  const machineId = await resolveMachineId(ctx, id);
  // Drop card pre-auths (MDB -1 at $0.00) — reader chatter, not vends.
  const sales = (await getLastSales(ctx.conn, machineId)).filter((s) => !isAuthNoise(s));
  const revenue = sales.reduce((a, s) => a + saleAmount(s), 0);
  const pay: Record<string, number> = {};
  const prod: Record<string, { count: number; revenue: number }> = {};
  for (const s of sales) {
    const p = salePayment(s) || "Unknown";
    pay[p] = (pay[p] ?? 0) + 1;
    // Key by slot so one physical selection is one row. The raw Lynx label
    // embeds the price ("Unknown(1031 = 7.00)"), so keying on it splits a slot
    // across every price it has sold at.
    const slot = saleSlot(s);
    const n = slot === "—" ? saleLabel(s) : `Slot ${slot}`;
    prod[n] = prod[n] ?? { count: 0, revenue: 0 };
    prod[n].count += 1;
    prod[n].revenue += saleAmount(s);
  }
  const topProducts = Object.entries(prod)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)
    .map(([name, v]) => ({ name, ...v }));
  const recent = sales.slice(0, 15).map((s) => ({
    slot: saleSlot(s),
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
      "Estimate based on the operator's configured rate and taxable %. Not tax advice; covers only sales recorded by Slovend Intelligence in the window.",
  };
}

export async function toolExport(ctx: ToolCtx, args: ToolArgs) {
  const machineId = await resolveMachineId(ctx, args.machineId);
  const win = resolveWindow({ range: args.range, from: args.from, to: args.to });
  const tz = await getMachineTimezone(ctx.email, machineId);
  const rows = await salesForExport(ctx.email, machineId, win, tz);
  return { machineId, window: win.label, timezone: tz, count: rows.length, rows: rows.slice(0, 1000) };
}

export async function toolAlertHistory(ctx: ToolCtx, args: ToolArgs) {
  const machineId = await resolveMachineId(ctx, args.machineId);
  const win = resolveWindow({ range: args.range, from: args.from, to: args.to });
  const tz = await getMachineTimezone(ctx.email, machineId);
  const sev = args.severity;
  const summary = await alertsSummary(ctx.email, machineId, win, tz, {
    q: args.q,
    severity: sev === "high" || sev === "med" || sev === "low" ? (sev as Severity) : undefined,
    category: args.category,
  });
  return {
    machineId,
    window: win.label,
    timezone: tz,
    total: summary.total,
    bySeverity: summary.bySeverity,
    byCategory: summary.byCategory,
    events: summary.rows.slice(0, 100),
    note: "Persisted event history recorded by Slovend Intelligence (deduped). Differs from get_alerts, which returns only Lynx's live recent window.",
  };
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
    description: "Connectivity & health of a machine: online state, last heartbeat, signal (RSSI value + quality band Excellent/Good/Fair/Poor/No signal), temperature.",
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
    description: "Recent LIVE alerts/events for a machine (faults, reader errors, etc.) from Lynx's recent window. For history/search over a date range use get_alert_history.",
    shape: machineArg,
    run: (ctx, a) => toolAlerts(ctx, a.machineId),
  },
  {
    name: "get_alert_history",
    description:
      "Compiled alert/event history recorded by Slovend Intelligence over a window, with totals by severity and category. Supports text search and severity/category filters — use this to investigate or diagnose past events.",
    shape: {
      ...rangeArgs,
      q: z.string().optional().describe("Text search over event description and category."),
      severity: z.enum(["high", "med", "low"]).optional().describe("Filter by severity."),
      category: z.string().optional().describe("Filter by exact event category."),
    },
    run: (ctx, a) => toolAlertHistory(ctx, a),
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
