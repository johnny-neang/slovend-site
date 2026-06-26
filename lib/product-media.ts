import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";

/**
 * Operator-supplied product media, keyed per slot by its raw MDBCode. This is the
 * manual fallback for image/name/description when Nayax's catalog carries none
 * (which is the case for most slots today). Every row here is `source = 'manual'`
 * and is surfaced with a "Manual" badge so it's never mistaken for Nayax data.
 */

export type ProductMedia = {
  mdbCode: number;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  imagePath: string | null;
  source: "manual";
  manualSlot: boolean; // operator-declared slot (may not be in Nayax yet)
  hidden: boolean; // suppressed phantom; mdb_code 0 = hide the unmapped group
  updatedAt: string;
};

type Row = {
  mdb_code: number;
  name: string | null;
  description: string | null;
  image_url: string | null;
  image_path: string | null;
  source: string;
  manual_slot: boolean;
  hidden: boolean;
  updated_at: string;
};

function toMedia(r: Row): ProductMedia {
  return {
    mdbCode: r.mdb_code,
    name: r.name,
    description: r.description,
    imageUrl: r.image_url,
    imagePath: r.image_path,
    source: "manual",
    manualSlot: r.manual_slot === true,
    hidden: r.hidden === true,
    updatedAt: r.updated_at,
  };
}

/** All manual media for a machine, keyed by MDBCode. Empty when no DB is configured. */
export async function getProductMedia(
  userKey: string,
  machineId: string,
): Promise<Map<number, ProductMedia>> {
  const out = new Map<number, ProductMedia>();
  if (!dbConfigured() || !userKey || !machineId) return out;
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      select mdb_code, name, description, image_url, image_path, source, manual_slot, hidden, updated_at
      from machine_product_media
      where user_key = ${userKey} and machine_id = ${machineId}
    `) as Row[];
    for (const r of rows) out.set(r.mdb_code, toMedia(r));
  } catch (e) {
    console.error("getProductMedia failed", e);
  }
  return out;
}

/** Read one slot's media (used by the editor + the replace path). */
export async function getOneProductMedia(
  userKey: string,
  machineId: string,
  mdbCode: number,
): Promise<ProductMedia | null> {
  if (!dbConfigured() || !userKey || !machineId) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select mdb_code, name, description, image_url, image_path, source, manual_slot, hidden, updated_at
    from machine_product_media
    where user_key = ${userKey} and machine_id = ${machineId} and mdb_code = ${mdbCode}
  `) as Row[];
  return rows.length ? toMedia(rows[0]) : null;
}

/**
 * Insert or update one slot's manual media. Only the provided fields are written;
 * pass `null` to clear a field (image_url/image_path default to keeping the
 * existing value when omitted via coalesce in the page-level caller).
 */
export async function upsertProductMedia(
  userKey: string,
  machineId: string,
  mdbCode: number,
  fields: {
    name?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    imagePath?: string | null;
    manualSlot?: boolean; // declares the slot; sticky (never un-set by a media edit)
  },
): Promise<void> {
  if (!dbConfigured() || !userKey || !machineId) return;
  await ensureSchema();
  const sql = getSql();
  const manualSlot = fields.manualSlot === true;
  await sql`
    insert into machine_product_media
      (user_key, machine_id, mdb_code, name, description, image_url, image_path, source, manual_slot, updated_at)
    values
      (${userKey}, ${machineId}, ${mdbCode}, ${fields.name ?? null},
       ${fields.description ?? null}, ${fields.imageUrl ?? null},
       ${fields.imagePath ?? null}, 'manual', ${manualSlot}, now())
    on conflict (user_key, machine_id, mdb_code) do update set
      name        = excluded.name,
      description = excluded.description,
      image_url   = coalesce(excluded.image_url, machine_product_media.image_url),
      image_path  = coalesce(excluded.image_path, machine_product_media.image_path),
      source      = 'manual',
      manual_slot = machine_product_media.manual_slot or excluded.manual_slot,
      updated_at  = now()
  `;
}

/**
 * Toggle just the `hidden` flag for one slot, without touching name/description/
 * image. Inserts a minimal row when none exists. `mdbCode` 0 is allowed and acts
 * as the "hide all unmapped (MDB 0)" sentinel.
 */
export async function setProductMediaFlags(
  userKey: string,
  machineId: string,
  mdbCode: number,
  fields: { hidden: boolean },
): Promise<void> {
  if (!dbConfigured() || !userKey || !machineId) return;
  await ensureSchema();
  const sql = getSql();
  await sql`
    insert into machine_product_media
      (user_key, machine_id, mdb_code, source, hidden, updated_at)
    values
      (${userKey}, ${machineId}, ${mdbCode}, 'manual', ${fields.hidden}, now())
    on conflict (user_key, machine_id, mdb_code) do update set
      hidden     = excluded.hidden,
      updated_at = now()
  `;
}

export async function deleteProductMedia(
  userKey: string,
  machineId: string,
  mdbCode: number,
): Promise<void> {
  if (!dbConfigured() || !userKey || !machineId) return;
  await ensureSchema();
  const sql = getSql();
  await sql`
    delete from machine_product_media
    where user_key = ${userKey} and machine_id = ${machineId} and mdb_code = ${mdbCode}
  `;
}
