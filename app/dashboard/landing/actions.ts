"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { getCtx } from "@/lib/dashboard";
import {
  upsertLandingConfig,
  addLandingAsset,
  deleteLandingAsset,
  reorderLandingAssets,
  normalizeSlug,
  validateSlug,
  isSlugAvailable,
  LandingError,
} from "@/lib/landing";

async function requireCtx() {
  const ctx = await getCtx();
  if (!ctx.email) redirect("/login");
  if (!ctx.machineId || !ctx.machine) redirect("/dashboard");
  return {
    userKey: ctx.email,
    machineId: ctx.machineId,
    machineNumber: String(ctx.machine.MachineNumber ?? ""),
    machineName:
      (ctx.machine.MachineName as string) ||
      (ctx.machine.MachineNumber as string) ||
      null,
  };
}

/** Publish toggle + slug + location. */
export async function saveLandingConfig(formData: FormData): Promise<void> {
  const { userKey, machineId, machineNumber, machineName } = await requireCtx();
  const slug = String(formData.get("slug") ?? "").trim() || null;
  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const title = String(formData.get("title") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;

  try {
    await upsertLandingConfig({
      userKey, machineId, machineNumber, machineName, slug, enabled, title, location,
    });
  } catch (e) {
    if (e instanceof LandingError) {
      redirect(`/dashboard/landing?error=${e.code}`);
    }
    throw e;
  }
  revalidatePath("/dashboard/landing");}

/** Persist a carousel asset after the client upload() resolves. */
export async function persistLandingAsset(input: {
  blobUrl: string;
  blobPath: string;
  mediaType: "image" | "video";
}): Promise<void> {
  const { userKey, machineId } = await requireCtx();
  if (!input.blobUrl || !input.blobPath) return;
  await addLandingAsset({
    userKey,
    machineId,
    mediaType: input.mediaType === "video" ? "video" : "image",
    blobUrl: input.blobUrl,
    blobPath: input.blobPath,
  });
  revalidatePath("/dashboard/landing");}

export async function removeLandingAsset(assetId: string): Promise<void> {
  const { userKey, machineId } = await requireCtx();
  const blobPath = await deleteLandingAsset(userKey, machineId, assetId);
  if (blobPath) await del(blobPath).catch(() => {});
  revalidatePath("/dashboard/landing");}

export async function reorderLandingAssetsAction(orderedIds: string[]): Promise<void> {
  const { userKey, machineId } = await requireCtx();
  await reorderLandingAssets(userKey, machineId, orderedIds);
  revalidatePath("/dashboard/landing");}

/** Live slug availability for the editor. */
export async function checkSlug(
  raw: string,
): Promise<{ ok: boolean; reason?: string; normalized: string }> {
  const { machineId } = await requireCtx();
  const normalized = normalizeSlug(raw);
  if (!normalized) return { ok: false, reason: "Empty", normalized };
  const v = validateSlug(normalized);
  if (!v.ok) return { ok: false, reason: v.reason, normalized };
  const free = await isSlugAvailable(normalized, machineId);
  return free ? { ok: true, normalized } : { ok: false, reason: "Already taken", normalized };
}
