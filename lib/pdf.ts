import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportSummary } from "@/lib/reports";

const CHERRY = rgb(0.8196, 0.1686, 0.2471);
const INK = rgb(0.094, 0.082, 0.075);
const GRAY = rgb(0.45, 0.43, 0.41);
const LINE = rgb(0.88, 0.86, 0.83);
const WHITE = rgb(1, 1, 1);
const PINK = rgb(1, 0.85, 0.87);

export async function buildReportPdf(opts: {
  machineName: string;
  rangeDays: number;
  generatedAt: string;
  summary: ReportSummary;
}): Promise<Uint8Array> {
  const { machineName, rangeDays, generatedAt, summary } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(`Vendai report — ${machineName}`);
  doc.setAuthor("Vendai · Slovend");

  const W = 595.28;
  const H = 841.89; // A4
  const page = doc.addPage([W, H]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const M = 40;

  const text = (s: string, x: number, y: number, size: number, font = helv, color = INK) =>
    page.drawText(s, { x, y, size, font, color });
  const right = (s: string, xRight: number, y: number, size: number, font = helv, color = INK) =>
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  // Standard PDF fonts are WinAnsi-encoded and throw on glyphs they can't encode.
  // Strip dynamic strings to printable ASCII; our own labels use safe literals (— · …).
  const clip = (s: string, max: number) => {
    const a = (s || "").replace(/[^\x20-\x7E]/g, "").trim() || "—";
    return a.length > max ? `${a.slice(0, max - 1)}…` : a;
  };
  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

  // Header bar
  page.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: CHERRY });
  text("Vendai", M, H - 52, 26, helvB, WHITE);
  right("FLEET REPORT", W - M, H - 44, 9, helvB, WHITE);
  right("slovend.com", W - M, H - 58, 8, helv, PINK);

  let y = H - 120;
  text(clip(machineName, 46), M, y, 22, serif, INK);
  y -= 16;
  text(`Last ${rangeDays} days · Generated ${generatedAt}`, M, y, 10, helv, GRAY);
  y -= 30;

  // Stats
  const stats: [string, string][] = [
    ["Revenue", summary.hasData ? money(summary.revenue) : "—"],
    ["Vends", String(summary.vends)],
    ["Avg sale", summary.vends ? money(summary.revenue / summary.vends) : "—"],
    ["Active days", String(summary.activeDays)],
  ];
  const colW = (W - 2 * M) / 4;
  stats.forEach(([label, val], i) => {
    const x = M + i * colW;
    text(val, x, y, 18, helvB, CHERRY);
    text(label.toUpperCase(), x, y - 13, 8, helvB, GRAY);
  });
  y -= 38;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 24;

  // Top products
  text("TOP PRODUCTS", M, y, 9, helvB, CHERRY);
  y -= 18;
  if (summary.topProducts.length) {
    for (const p of summary.topProducts.slice(0, 12)) {
      text(clip(p.product, 46), M, y, 11, helv, INK);
      right(`${p.vends} · ${money(p.revenue)}`, W - M, y, 10, helv, GRAY);
      y -= 16;
    }
  } else {
    text("No data yet — history builds as the dashboard is used.", M, y, 10, helv, GRAY);
    y -= 16;
  }
  y -= 16;

  // Payment mix
  text("PAYMENT MIX", M, y, 9, helvB, CHERRY);
  y -= 18;
  if (summary.payMix.length) {
    for (const pm of summary.payMix) {
      text(clip(pm.method, 40), M, y, 11, helv, INK);
      right(String(pm.n), W - M, y, 10, helv, GRAY);
      y -= 16;
    }
  } else {
    text("No data yet.", M, y, 10, helv, GRAY);
    y -= 16;
  }

  // Footer
  page.drawLine({ start: { x: M, y: 52 }, end: { x: W - M, y: 52 }, thickness: 1, color: LINE });
  text("Slovend LLC · Vendai", M, 38, 8, helv, GRAY);
  right("A FutureNow company", W - M, 38, 8, helv, GRAY);

  return doc.save();
}
