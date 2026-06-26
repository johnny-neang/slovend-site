import "server-only";
import { unstable_cache } from "next/cache";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import {
  getMachineProducts,
  getCatalogProducts,
  productNayaxId,
  type NayaxConn,
  type Product,
  type CatalogProduct,
} from "@/lib/nayax";

/**
 * Landing-page config + carousel assets for the public /vending/[handle] page.
 * `machine_id` is the numeric Nayax MachineID (used for API calls); the public
 * `handle` resolves either the operator's custom `slug` or the `machine_number`.
 */

export type LandingConfig = {
  userKey: string;
  machineId: string;
  machineNumber: string;
  slug: string | null;
  enabled: boolean;
  title: string | null;
  machineName: string | null;
  location: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type LandingAsset = {
  assetId: string;
  mediaType: "image" | "video";
  blobUrl: string;
  blobPath: string;
  posterUrl: string | null;
  orderIdx: number;
};

export class LandingError extends Error {
  code: "slug_invalid" | "slug_taken" | "db";
  constructor(code: LandingError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "LandingError";
  }
}

const RESERVED = new Set([
  "dashboard", "settings", "api", "login", "vending", "admin", "assets",
  "_next", "favicon", "app", "public", "static", "robots", "sitemap", "about",
  "locations", "vendai",
]);

/** Lowercase, strip to [a-z0-9-], collapse and trim dashes. */
export function normalizeSlug(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (slug.length < 3) return { ok: false, reason: "Too short (min 3)" };
  if (slug.length > 48) return { ok: false, reason: "Too long (max 48)" };
  if (RESERVED.has(slug)) return { ok: false, reason: "Reserved word" };
  if (/^\d+$/.test(slug)) return { ok: false, reason: "Can't be all digits" };
  return { ok: true };
}

type ConfigRow = {
  user_key: string;
  machine_id: string;
  machine_number: string;
  slug: string | null;
  enabled: boolean;
  title: string | null;
  machine_name: string | null;
  location: string | null;
  published_at: string | null;
  updated_at: string;
};

function toConfig(r: ConfigRow): LandingConfig {
  return {
    userKey: r.user_key,
    machineId: r.machine_id,
    machineNumber: r.machine_number,
    slug: r.slug,
    enabled: r.enabled,
    title: r.title,
    machineName: r.machine_name,
    location: r.location,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}

/** Public resolution: match slug OR machine_number, enabled only. O(1) via indexes. */
export async function resolveLanding(
  handle: string,
): Promise<{ userKey: string; machineId: string } | null> {
  if (!dbConfigured() || !handle) return null;
  await ensureSchema();
  const sql = getSql();
  const norm = normalizeSlug(handle);
  try {
    const rows = (await sql`
      select user_key, machine_id from machine_landing
      where enabled = true
        and (machine_number = ${handle} or (slug is not null and slug = ${norm}))
      limit 1
    `) as { user_key: string; machine_id: string }[];
    return rows.length
      ? { userKey: rows[0].user_key, machineId: rows[0].machine_id }
      : null;
  } catch (e) {
    console.error("resolveLanding failed", e);
    return null;
  }
}

export async function getLandingConfig(
  userKey: string,
  machineId: string,
): Promise<LandingConfig | null> {
  if (!dbConfigured() || !userKey || !machineId) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select user_key, machine_id, machine_number, slug, enabled,
           title, machine_name, location, published_at, updated_at
    from machine_landing
    where user_key = ${userKey} and machine_id = ${machineId}
  `) as ConfigRow[];
  return rows.length ? toConfig(rows[0]) : null;
}

/** True if `slug` is free (excluding the caller's own machine row). */
export async function isSlugAvailable(slug: string, forMachineId: string): Promise<boolean> {
  if (!dbConfigured()) return false;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select 1 from machine_landing
    where slug = ${slug} and machine_id <> ${forMachineId} limit 1
  `) as unknown[];
  return rows.length === 0;
}

export async function upsertLandingConfig(input: {
  userKey: string;
  machineId: string;
  machineNumber: string;
  machineName: string | null;
  slug: string | null;
  enabled: boolean;
  title: string | null;
  location: string | null;
}): Promise<LandingConfig> {
  if (!dbConfigured()) throw new LandingError("db", "Database not configured");
  await ensureSchema();
  const sql = getSql();

  let slug: string | null = null;
  if (input.slug && input.slug.trim()) {
    slug = normalizeSlug(input.slug);
    const v = validateSlug(slug);
    if (!v.ok) throw new LandingError("slug_invalid", v.reason);
    const free = await isSlugAvailable(slug, input.machineId);
    if (!free) throw new LandingError("slug_taken", "That URL is already taken");
  }

  try {
    const rows = (await sql`
      insert into machine_landing
        (user_key, machine_id, machine_number, slug, enabled, title, machine_name, location, published_at, updated_at)
      values
        (${input.userKey}, ${input.machineId}, ${input.machineNumber}, ${slug},
         ${input.enabled}, ${input.title}, ${input.machineName}, ${input.location},
         case when ${input.enabled} then now() else null end, now())
      on conflict (user_key, machine_id) do update set
        machine_number = excluded.machine_number,
        slug           = excluded.slug,
        enabled        = excluded.enabled,
        title          = excluded.title,
        machine_name   = excluded.machine_name,
        location       = excluded.location,
        published_at   = case
          when excluded.enabled and machine_landing.published_at is null then now()
          else machine_landing.published_at end,
        updated_at     = now()
      returning user_key, machine_id, machine_number, slug, enabled,
                title, machine_name, location, published_at, updated_at
    `) as ConfigRow[];
    return toConfig(rows[0]);
  } catch (e) {
    // Defensive: a race could still trip the partial-unique slug index.
    if (e instanceof Error && /machine_landing_slug_idx|duplicate key/i.test(e.message)) {
      throw new LandingError("slug_taken", "That URL is already taken");
    }
    throw e;
  }
}

type AssetRow = {
  asset_id: string;
  media_type: string;
  blob_url: string;
  blob_path: string;
  poster_url: string | null;
  order_idx: number;
};

function toAsset(r: AssetRow): LandingAsset {
  return {
    assetId: r.asset_id,
    mediaType: r.media_type === "video" ? "video" : "image",
    blobUrl: r.blob_url,
    blobPath: r.blob_path,
    posterUrl: r.poster_url,
    orderIdx: r.order_idx,
  };
}

export async function listLandingAssets(
  userKey: string,
  machineId: string,
): Promise<LandingAsset[]> {
  if (!dbConfigured() || !userKey || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select asset_id, media_type, blob_url, blob_path, poster_url, order_idx
    from machine_landing_assets
    where user_key = ${userKey} and machine_id = ${machineId}
    order by order_idx asc, created_at asc
  `) as AssetRow[];
  return rows.map(toAsset);
}

export async function addLandingAsset(input: {
  userKey: string;
  machineId: string;
  mediaType: "image" | "video";
  blobUrl: string;
  blobPath: string;
  posterUrl?: string | null;
}): Promise<void> {
  if (!dbConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  const assetId = crypto.randomUUID();
  await sql`
    insert into machine_landing_assets
      (asset_id, user_key, machine_id, media_type, blob_url, blob_path, poster_url, order_idx)
    values
      (${assetId}, ${input.userKey}, ${input.machineId}, ${input.mediaType},
       ${input.blobUrl}, ${input.blobPath}, ${input.posterUrl ?? null},
       coalesce((select max(order_idx) + 1 from machine_landing_assets
                 where user_key = ${input.userKey} and machine_id = ${input.machineId}), 0))
  `;
}

/** Deletes a row and returns its blob_path (for blob cleanup), or null. */
export async function deleteLandingAsset(
  userKey: string,
  machineId: string,
  assetId: string,
): Promise<string | null> {
  if (!dbConfigured()) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    delete from machine_landing_assets
    where user_key = ${userKey} and machine_id = ${machineId} and asset_id = ${assetId}
    returning blob_path
  `) as { blob_path: string }[];
  return rows.length ? rows[0].blob_path : null;
}

export async function reorderLandingAssets(
  userKey: string,
  machineId: string,
  orderedIds: string[],
): Promise<void> {
  if (!dbConfigured() || !orderedIds.length) return;
  await ensureSchema();
  const sql = getSql();
  for (let i = 0; i < orderedIds.length; i++) {
    await sql`
      update machine_landing_assets set order_idx = ${i}
      where user_key = ${userKey} and machine_id = ${machineId} and asset_id = ${orderedIds[i]}
    `;
  }
}

/* ---- cached planogram for the public page ---- */

async function fetchPlanogram(
  machineId: string,
  conn: NayaxConn,
): Promise<{ products: Product[]; catalogEntries: [number, CatalogProduct][] }> {
  const products = await getMachineProducts(conn, machineId).catch(
    () => [] as Product[],
  );
  const ids = products.map(productNayaxId).filter((n): n is number => n != null);
  const catalog = ids.length
    ? await getCatalogProducts(conn, ids).catch(() => new Map<number, CatalogProduct>())
    : new Map<number, CatalogProduct>();
  return { products, catalogEntries: [...catalog.entries()] };
}

/** Planogram + catalog for a machine, memoized 120s per machine (tag
 * `vending:<machineId>`). `conn` is captured in the closure, NOT part of the
 * cache key, so the operator token is never written into the cache. */
export function getCachedPlanogram(machineId: string, conn: NayaxConn) {
  return unstable_cache(
    () => fetchPlanogram(machineId, conn),
    ["vending-planogram", machineId],
    { revalidate: 120, tags: [`vending:${machineId}`] },
  )();
}
