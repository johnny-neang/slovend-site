import "server-only";
import crypto from "crypto";

/**
 * AES-256-GCM encryption for secrets at rest (e.g. per-user Nayax tokens).
 * Key comes from ENCRYPTION_KEY (ideally a 32-byte base64 string; any other
 * string is hashed to 32 bytes). Output format: ivB64:tagB64:cipherB64.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string | null {
  try {
    const [ivB, tagB, dataB] = payload.split(":");
    if (!ivB || !tagB || !dataB) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivB, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
