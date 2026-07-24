import "server-only";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type { ReportSummary } from "@/lib/reports";
import type { AlertsSummary } from "@/lib/alerts";
import { SLOVEND_WORDMARK_WHITE_B64, SLOVEND_WORDMARK_WHITE_DIMS } from "@/lib/brand-logo";

const CHERRY = rgb(0.8196, 0.1686, 0.2471);
const INK = rgb(0.094, 0.082, 0.075);
const GRAY = rgb(0.45, 0.43, 0.41);
const LINE = rgb(0.88, 0.86, 0.83);
const WHITE = rgb(1, 1, 1);
const PINK = rgb(1, 0.85, 0.87);

// A4
const W = 595.28;
const H = 841.89;
const M = 40;

type Fonts = { helv: PDFFont; helvB: PDFFont; serif: PDFFont };

/** Page-bound drawing helpers. Dynamic strings are ASCII-sanitized via clip(),
 * since the standard (WinAnsi) fonts throw on glyphs they can't encode. */
function kit(page: PDFPage, f: Fonts) {
  const text = (s: string, x: number, y: number, size: number, font = f.helv, color = INK) =>
    page.drawText(s, { x, y, size, font, color });
  const right = (s: string, xRight: number, y: number, size: number, font = f.helv, color = INK) =>
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  const clip = (s: string, max: number) => {
    const a = (s || "").replace(/[^\x20-\x7E]/g, "").trim() || "—";
    return a.length > max ? `${a.slice(0, max - 1)}…` : a;
  };
  return { text, right, clip };
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function newDoc(title: string): Promise<{
  doc: PDFDocument;
  page: PDFPage;
  fonts: Fonts;
  logo: PDFImage;
}> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor("Slovend Intelligence");
  const page = doc.addPage([W, H]);
  const fonts: Fonts = {
    helv: await doc.embedFont(StandardFonts.Helvetica),
    helvB: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const logo = await doc.embedPng(Buffer.from(SLOVEND_WORDMARK_WHITE_B64, "base64"));
  return { doc, page, fonts, logo };
}

/** Cherry band with the white Slovend wordmark top-left and a label top-right. */
function drawHeader(page: PDFPage, f: Fonts, logo: PDFImage, rightTop: string) {
  const k = kit(page, f);
  page.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: CHERRY });
  const logoH = 26;
  const logoW = logoH * (SLOVEND_WORDMARK_WHITE_DIMS.w / SLOVEND_WORDMARK_WHITE_DIMS.h);
  page.drawImage(logo, { x: M, y: H - 43 - logoH / 2, width: logoW, height: logoH });
  k.right(rightTop, W - M, H - 44, 9, f.helvB, WHITE);
  k.right("slovend.com", W - M, H - 58, 8, f.helv, PINK);
}

function drawFooter(page: PDFPage, f: Fonts, note?: string) {
  const k = kit(page, f);
  if (note) {
    // wrap the note above the footer rule
    const words = note.split(" ");
    const max = 96;
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + w).length > max) {
        lines.push(cur.trim());
        cur = "";
      }
      cur += `${w} `;
    }
    if (cur.trim()) lines.push(cur.trim());
    let ny = 62 + (lines.length - 1) * 10;
    for (const ln of lines) {
      k.text(ln, M, ny, 7.5, f.helv, GRAY);
      ny -= 10;
    }
  }
  page.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 1, color: LINE });
  k.text("Slovend LLC · Slovend Intelligence", M, 30, 8, f.helv, GRAY);
  k.right("A FutureNow company", W - M, 30, 8, f.helv, GRAY);
}

export async function buildReportPdf(opts: {
  machineName: string;
  windowLabel: string;
  generatedAt: string;
  summary: ReportSummary;
}): Promise<Uint8Array> {
  const { machineName, windowLabel, generatedAt, summary } = opts;
  const { doc, page, fonts, logo } = await newDoc(`Slovend Intelligence report — ${machineName}`);
  const k = kit(page, fonts);
  drawHeader(page, fonts, logo, "SLOVEND INTELLIGENCE · FLEET REPORT");

  let y = H - 120;
  k.text(k.clip(machineName, 46), M, y, 22, fonts.serif, INK);
  y -= 16;
  k.text(`${windowLabel} · Generated ${generatedAt}`, M, y, 10, fonts.helv, GRAY);
  y -= 30;

  const stats: [string, string][] = [
    ["Revenue", summary.hasData ? money(summary.revenue) : "—"],
    ["Vends", String(summary.vends)],
    ["Avg sale", summary.vends ? money(summary.revenue / summary.vends) : "—"],
    ["Active days", String(summary.activeDays)],
  ];
  const colW = (W - 2 * M) / 4;
  stats.forEach(([label, val], i) => {
    const x = M + i * colW;
    k.text(val, x, y, 18, fonts.helvB, CHERRY);
    k.text(label.toUpperCase(), x, y - 13, 8, fonts.helvB, GRAY);
  });
  y -= 38;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 24;

  k.text("TOP PRODUCTS", M, y, 9, fonts.helvB, CHERRY);
  y -= 18;
  if (summary.topProducts.length) {
    for (const p of summary.topProducts.slice(0, 12)) {
      k.text(k.clip(p.product, 46), M, y, 11, fonts.helv, INK);
      k.right(`${p.vends} · ${money(p.revenue)}`, W - M, y, 10, fonts.helv, GRAY);
      y -= 16;
    }
  } else {
    k.text("No data yet — history builds as the dashboard is used.", M, y, 10, fonts.helv, GRAY);
    y -= 16;
  }
  y -= 16;

  k.text("PAYMENT MIX", M, y, 9, fonts.helvB, CHERRY);
  y -= 18;
  if (summary.payMix.length) {
    for (const pm of summary.payMix) {
      k.text(k.clip(pm.method, 40), M, y, 11, fonts.helv, INK);
      k.right(String(pm.n), W - M, y, 10, fonts.helv, GRAY);
      y -= 16;
    }
  } else {
    k.text("No data yet.", M, y, 10, fonts.helv, GRAY);
    y -= 16;
  }

  drawFooter(page, fonts);
  return doc.save();
}

export async function buildAlertsPdf(opts: {
  machineName: string;
  windowLabel: string;
  generatedAt: string;
  timezone: string;
  summary: AlertsSummary;
}): Promise<Uint8Array> {
  const { machineName, windowLabel, generatedAt, timezone, summary } = opts;
  const { doc, page, fonts, logo } = await newDoc(`Slovend Intelligence alerts — ${machineName}`);
  const k = kit(page, fonts);
  drawHeader(page, fonts, logo, "SLOVEND INTELLIGENCE · ALERTS & EVENTS");

  let y = H - 120;
  k.text(k.clip(machineName, 46), M, y, 22, fonts.serif, INK);
  y -= 16;
  k.text(`${windowLabel} · ${timezone} · Generated ${generatedAt}`, M, y, 10, fonts.helv, GRAY);
  y -= 30;

  const stats: [string, string][] = [
    ["Events", String(summary.total)],
    ["High", String(summary.bySeverity.high)],
    ["Medium", String(summary.bySeverity.med)],
    ["Low", String(summary.bySeverity.low)],
  ];
  const colW = (W - 2 * M) / 4;
  stats.forEach(([label, val], i) => {
    const x = M + i * colW;
    k.text(val, x, y, 18, fonts.helvB, CHERRY);
    k.text(label.toUpperCase(), x, y - 13, 8, fonts.helvB, GRAY);
  });
  y -= 38;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 22;

  // Events table
  k.text("TIME", M, y, 8, fonts.helvB, GRAY);
  k.text("SEV", M + 150, y, 8, fonts.helvB, GRAY);
  k.text("CATEGORY", M + 190, y, 8, fonts.helvB, GRAY);
  k.text("EVENT", M + 300, y, 8, fonts.helvB, GRAY);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  y -= 14;

  const rows = summary.rows.slice(0, 34);
  for (const r of rows) {
    if (y < 70) break; // keep within one page
    k.text(k.clip(r.time, 22), M, y, 9, fonts.helv, INK);
    k.text(k.clip(r.severity, 5), M + 150, y, 9, fonts.helv, r.severity === "high" ? CHERRY : GRAY);
    k.text(k.clip(r.category || "—", 18), M + 190, y, 9, fonts.helv, GRAY);
    k.text(k.clip(r.event, 42), M + 300, y, 9, fonts.helv, INK);
    y -= 15;
  }
  if (!rows.length) {
    k.text("No events recorded in this range.", M, y, 10, fonts.helv, GRAY);
    y -= 15;
  }

  drawFooter(
    page,
    fonts,
    `${summary.total} event${summary.total === 1 ? "" : "s"} recorded by Slovend Intelligence in this window${
      summary.rows.length > rows.length ? ` (showing the ${rows.length} most recent)` : ""
    }. Severity is heuristic, derived from each event's description.`,
  );
  return doc.save();
}

export type TaxPdfData = {
  machineName: string;
  windowLabel: string;
  generatedAt: string;
  timezone: string;
  ratePct: number;
  taxablePct: number;
  inclusive: boolean;
  gross: number;
  taxableReceipts: number;
  tax: number;
  net: number;
  txns: number;
  coveredFrom: string | null;
  coveredTo: string | null;
  byPeriod: { period: string; gross: number; tax: number; net: number; txns: number }[];
};

export async function buildTaxPdf(d: TaxPdfData): Promise<Uint8Array> {
  const { doc, page, fonts, logo } = await newDoc(`Slovend Intelligence sales tax — ${d.machineName}`);
  const k = kit(page, fonts);
  drawHeader(page, fonts, logo, "SLOVEND INTELLIGENCE · SALES TAX SUMMARY");

  let y = H - 120;
  k.text(k.clip(d.machineName, 46), M, y, 22, fonts.serif, INK);
  y -= 16;
  k.text(`${d.windowLabel} · ${d.timezone} · Generated ${d.generatedAt}`, M, y, 10, fonts.helv, GRAY);
  y -= 14;
  const basis = `Rate ${d.ratePct}% · ${d.taxablePct}% of receipts taxable · prices ${
    d.inclusive ? "tax-inclusive" : "tax-exclusive"
  }`;
  k.text(basis, M, y, 9, fonts.helv, GRAY);
  y -= 28;

  const stats: [string, string][] = [
    ["Gross sales", money(d.gross)],
    ["Taxable", money(d.taxableReceipts)],
    ["Sales tax", money(d.tax)],
    ["Net sales", money(d.net)],
  ];
  const colW = (W - 2 * M) / 4;
  stats.forEach(([label, val], i) => {
    const x = M + i * colW;
    k.text(val, x, y, 18, fonts.helvB, CHERRY);
    k.text(label.toUpperCase(), x, y - 13, 8, fonts.helvB, GRAY);
  });
  y -= 38;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 22;

  // Per-period table
  k.text("PERIOD", M, y, 8, fonts.helvB, GRAY);
  k.right("GROSS", M + 250, y, 8, fonts.helvB, GRAY);
  k.right("TAX", M + 350, y, 8, fonts.helvB, GRAY);
  k.right("NET", M + 450, y, 8, fonts.helvB, GRAY);
  k.right("TXNS", W - M, y, 8, fonts.helvB, GRAY);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  y -= 14;
  const rows = d.byPeriod.slice(0, 30);
  for (const p of rows) {
    k.text(k.clip(p.period, 30), M, y, 10, fonts.helv, INK);
    k.right(money(p.gross), M + 250, y, 10, fonts.helv, INK);
    k.right(money(p.tax), M + 350, y, 10, fonts.helv, CHERRY);
    k.right(money(p.net), M + 450, y, 10, fonts.helv, GRAY);
    k.right(String(p.txns), W - M, y, 10, fonts.helv, GRAY);
    y -= 15;
  }
  if (!rows.length) {
    k.text("No sales recorded in this range.", M, y, 10, fonts.helv, GRAY);
    y -= 15;
  }

  const covered =
    d.coveredFrom && d.coveredTo
      ? `Based on ${d.txns} transactions recorded by Slovend Intelligence from ${d.coveredFrom} to ${d.coveredTo}.`
      : "No transactions recorded by Slovend Intelligence in this range.";
  drawFooter(
    page,
    fonts,
    `${covered} Estimate to assist filing, based on your configured rate and taxable %. Not tax advice — verify with the CDTFA.`,
  );
  return doc.save();
}
