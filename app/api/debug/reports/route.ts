import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { reportSummary } from "@/lib/reports";
import { taxReport } from "@/lib/tax";
import { resolveWindow } from "@/lib/window";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// TEMPORARY diagnostic — remove after verifying the timezone-SQL fix.
const KEY = "dbg_9q2x7mzk_tmp";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== KEY) return new Response("not found", { status: 404 });
  if (!dbConfigured()) return Response.json({ db: false });

  await ensureSchema();
  const sql = getSql();
  const out: Record<string, unknown> = {};

  const totals = (await sql`
    select count(*)::int as total,
           count(distinct user_key)::int as users,
           count(distinct machine_id)::int as machines,
           to_char(min(occurred_at) at time zone 'UTC', 'YYYY-MM-DD') as mn,
           to_char(max(occurred_at) at time zone 'UTC', 'YYYY-MM-DD') as mx
    from sales
  `) as Record<string, unknown>[];
  out.salesTable = totals[0];

  const sample = (await sql`
    select user_key, machine_id from sales order by occurred_at desc limit 1
  `) as { user_key: string; machine_id: string }[];
  out.sample = sample[0] ?? null;

  if (sample[0]) {
    const { user_key, machine_id } = sample[0];
    const win = resolveWindow({ range: "30" });

    // Raw test of the inlined-literal timezone query (surfaces any SQL error).
    try {
      const Z = "'America/Los_Angeles'";
      const raw = (await sql.query(
        `select count(*)::int as vends, coalesce(sum(amount),0)::float as revenue
         from sales where user_key = $1 and machine_id = $2
           and occurred_at >= ($3::date)::timestamp at time zone ${Z}
           and occurred_at <  (($4::date + 1)::timestamp) at time zone ${Z}`,
        [user_key, machine_id, win.fromDate, win.toDate],
      )) as Record<string, unknown>[];
      out.rawQuery = raw[0];
    } catch (e) {
      out.rawQueryError = e instanceof Error ? e.message : String(e);
    }

    const rep = await reportSummary(user_key, machine_id, win, "America/Los_Angeles");
    out.reportSummary = {
      hasData: rep.hasData,
      vends: rep.vends,
      revenue: rep.revenue,
      byDayLen: rep.byDay.length,
    };

    const tr = await taxReport(
      user_key,
      machine_id,
      win,
      { ratePct: 8.75, taxablePct: 100, inclusive: true },
      "America/Los_Angeles",
    );
    out.taxReport = { hasData: tr.hasData, gross: tr.gross, txns: tr.txns };
  }

  return Response.json(out);
}
