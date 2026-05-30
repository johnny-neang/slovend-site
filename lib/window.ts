import "server-only";

/**
 * A reporting window. Presets (7/30/90) are rolling windows ending now; custom
 * windows are an inclusive calendar range [fromDate, toDate]. Both expose UTC
 * bounds for SQL (`occurred_at >= fromIso AND occurred_at < toExclusiveIso`),
 * plus labels/slugs/querystring for display, filenames and links.
 */
export type Win = {
  preset: number | null; // 7 | 30 | 90, or null for a custom range
  fromDate: string; // YYYY-MM-DD inclusive
  toDate: string; // YYYY-MM-DD inclusive
  fromIso: string; // UTC start
  toExclusiveIso: string; // UTC end-exclusive
  label: string; // e.g. "Last 30 days" | "May 1 – May 29, 2026"
  short: string; // compact, for tile captions: "30d" | "5/1–5/29"
  slug: string; // filename slug: "30d" | "2026-05-01_2026-05-29"
  qs: string; // querystring to reproduce: "range=30" | "from=…&to=…"
};

const PRESETS = [7, 30, 90];
const DAY = 86400000;
const MAX_DAYS = 366; // guard against unbounded custom ranges

function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function long(s: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${s}T00:00:00Z`));
}
function md(s: string): string {
  const d = new Date(`${s}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function presetWindow(days: number): Win {
  const now = new Date();
  const from = new Date(now.getTime() - days * DAY);
  return {
    preset: days,
    fromDate: ymd(from),
    toDate: ymd(now),
    fromIso: from.toISOString(),
    toExclusiveIso: now.toISOString(),
    label: `Last ${days} days`,
    short: `${days}d`,
    slug: `${days}d`,
    qs: `range=${days}`,
  };
}

export function resolveWindow(p: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): Win {
  const from = (p.from ?? "").trim();
  const to = (p.to ?? "").trim();

  if (from && to && isDate(from) && isDate(to)) {
    let f = from;
    let t = to;
    if (f > t) [f, t] = [t, f]; // tolerate reversed inputs
    const tMs = Date.parse(`${t}T00:00:00Z`);
    if ((tMs - Date.parse(`${f}T00:00:00Z`)) / DAY > MAX_DAYS) {
      f = ymd(new Date(tMs - MAX_DAYS * DAY));
    }
    return {
      preset: null,
      fromDate: f,
      toDate: t,
      fromIso: `${f}T00:00:00.000Z`,
      toExclusiveIso: new Date(tMs + DAY).toISOString(),
      label: `${long(f)} – ${long(t)}`,
      short: `${md(f)}–${md(t)}`,
      slug: `${f}_${t}`,
      qs: `from=${f}&to=${t}`,
    };
  }

  const n = Number(p.range);
  return presetWindow(PRESETS.includes(n) ? n : 30);
}
