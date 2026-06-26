/**
 * Browser-only image util (uses canvas/createImageBitmap). Center-crops an image
 * File to a square and encodes it as WebP (falling back to JPEG, then to the
 * original file) so product tiles render uniformly and storage stays light.
 */
export async function toSquareWebp(file: File, size = 800): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width: w, height: h } = bitmap;
    if (!w || !h) return file;

    // cover: scale so the shorter edge fills the square, then centre-crop overflow.
    const scale = size / Math.min(w, h);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, dx, dy, dw, dh);

    const encode = (type: string, q?: number) =>
      new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));

    const webp = await encode("image/webp", 0.82);
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await encode("image/jpeg", 0.85);
    return jpeg ?? file;
  } catch {
    return file;
  }
}
