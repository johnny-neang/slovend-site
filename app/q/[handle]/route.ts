import { NextResponse } from "next/server";
import { resolveLanding, recordLandingScan } from "@/lib/landing";

export const dynamic = "force-dynamic";

// Crude filter so link-preview crawlers don't inflate the scan count.
const BOT_RE =
  /bot|crawl|spider|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|preview|monitor|curl|wget|headless|lighthouse|pingdom/i;

/** QR target: records a scan, then redirects to the public page with UTM tags
 * (so Vercel Web Analytics also attributes it). Public — not middleware-gated. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  const { handle } = await params;
  const dest = new URL(
    `/vending/${encodeURIComponent(handle)}?utm_source=qr&utm_medium=qr&utm_campaign=machine_qr`,
    req.url,
  );

  const resolved = await resolveLanding(handle);
  if (resolved) {
    const ua = req.headers.get("user-agent") ?? "";
    if (!BOT_RE.test(ua)) {
      await recordLandingScan(resolved.userKey, resolved.machineId, "qr");
    }
  }

  return NextResponse.redirect(dest, 302);
}
