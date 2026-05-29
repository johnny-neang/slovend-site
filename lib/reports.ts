import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";

export type ReportSummary = {
  hasData: boolean;
  vends: number;
  revenue: number;
  activeDays: number;
  byDay: { day: string; vends: number; revenue: number }[];
  topProducts: { product: string; vends: number; revenue: number }[];
  payMix: { method: string; n: number }[];
  hours: { hr: number; n: number }[];
};

const EMPTY: ReportSummary = {
  hasData: false,
  vends: 0,
  revenue: 0,
  activeDays: 0,
  byDay: [],
  topProducts: [],
  payMix: [],
  hours: [],
};

export async function reportSummary(
  userKey: string,
  machineId: string,
  days: number,
): Promise<ReportSummary> {
  if (!dbConfigured() || !machineId) return EMPTY;
  await ensureSchema();
  const sql = getSql();
  const since = `${days} days`;

  const totals = (await sql`
    select count(*)::int as vends,
           coalesce(sum(amount),0)::float as revenue,
           count(distinct date_trunc('day', occurred_at))::int as active_days
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= now() - ${since}::interval
  `) as { vends: number; revenue: number; active_days: number }[];

  const t = totals[0] ?? { vends: 0, revenue: 0, active_days: 0 };
  if (!t.vends) return EMPTY;

  const byDay = (await sql`
    select to_char(date_trunc('day', occurred_at), 'Mon DD') as day,
           count(*)::int as vends,
           coalesce(sum(amount),0)::float as revenue
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= now() - ${since}::interval
    group by date_trunc('day', occurred_at)
    order by date_trunc('day', occurred_at)
  `) as { day: string; vends: number; revenue: number }[];

  const topProducts = (await sql`
    select coalesce(nullif(product,''),'—') as product,
           count(*)::int as vends,
           coalesce(sum(amount),0)::float as revenue
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= now() - ${since}::interval
    group by 1 order by revenue desc limit 10
  `) as { product: string; vends: number; revenue: number }[];

  const payMix = (await sql`
    select coalesce(nullif(payment_method,''),'Unknown') as method, count(*)::int as n
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= now() - ${since}::interval
    group by 1 order by n desc
  `) as { method: string; n: number }[];

  const hours = (await sql`
    select extract(hour from occurred_at)::int as hr, count(*)::int as n
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= now() - ${since}::interval
    group by 1 order by 1
  `) as { hr: number; n: number }[];

  return {
    hasData: true,
    vends: t.vends,
    revenue: t.revenue,
    activeDays: t.active_days,
    byDay,
    topProducts,
    payMix,
    hours,
  };
}
