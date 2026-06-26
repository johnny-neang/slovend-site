"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { getCtx } from "@/lib/dashboard";
import {
  getOneProductMedia,
  upsertProductMedia,
  deleteProductMedia,
} from "@/lib/product-media";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB ceiling (images are downscaled client-side first)

async function requireCtx() {
  const ctx = await getCtx();
  if (!ctx.email) redirect("/login");
  if (!ctx.machineId) redirect("/dashboard");
  return { userKey: ctx.email, machineId: ctx.machineId };
}

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return fromType && /^[a-z0-9]{2,5}$/i.test(fromType) ? fromType.toLowerCase() : "jpg";
}

/** Save (insert/replace) one slot's manual product media: name, description, and
 * optionally a newly uploaded image (stored in Vercel Blob). Flagged `manual`. */
export async function saveProductMedia(formData: FormData): Promise<void> {
  const { userKey, machineId } = await requireCtx();

  const mdbCode = Math.trunc(Number(formData.get("mdbCode")));
  if (!Number.isFinite(mdbCode) || mdbCode <= 0) redirect("/dashboard/inventory?view=grid");

  const name = String(formData.get("name") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  let imageUrl: string | null | undefined; // undefined = leave existing image untouched
  let imagePath: string | null | undefined;

  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      redirect("/dashboard/inventory?view=grid&error=type");
    }
    if (file.size > MAX_BYTES) {
      redirect("/dashboard/inventory?view=grid&error=size");
    }
    const safeUser = userKey.replace(/[^a-z0-9]/gi, "_");
    const path = `product-media/${safeUser}/${machineId}/${mdbCode}-${Date.now()}.${extFromFile(file)}`;
    const blob = await put(path, file, { access: "public" });
    imageUrl = blob.url;
    imagePath = blob.pathname;

    // Best-effort cleanup of the previously stored image on replace.
    const prev = await getOneProductMedia(userKey, machineId, mdbCode);
    if (prev?.imageUrl && prev.imageUrl !== imageUrl) {
      await del(prev.imageUrl).catch(() => {});
    }
  }

  await upsertProductMedia(userKey, machineId, mdbCode, {
    name,
    description,
    imageUrl: imageUrl ?? null,
    imagePath: imagePath ?? null,
  });

  revalidatePath("/dashboard/inventory");
}

/** Clear a slot's manual media and delete its blob image. */
export async function removeProductMedia(formData: FormData): Promise<void> {
  const { userKey, machineId } = await requireCtx();

  const mdbCode = Math.trunc(Number(formData.get("mdbCode")));
  if (!Number.isFinite(mdbCode) || mdbCode <= 0) redirect("/dashboard/inventory?view=grid");

  const prev = await getOneProductMedia(userKey, machineId, mdbCode);
  if (prev?.imageUrl) await del(prev.imageUrl).catch(() => {});

  await deleteProductMedia(userKey, machineId, mdbCode);
  revalidatePath("/dashboard/inventory");
}
