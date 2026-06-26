import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/dashboard";

/**
 * Client-direct Blob upload token route for landing-page carousel assets.
 * Videos exceed the server-action / function body cap, so the browser uploads
 * straight to Blob using a short-lived token minted here. This route is not
 * middleware-gated, so it authenticates itself via the session (getCtx).
 */

const ALLOWED = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
];
const MAX_BYTES = 100 * 1024 * 1024; // 100MB

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  const ctx = await getCtx();
  if (!ctx.email || !ctx.machineId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const safeUser = ctx.email.replace(/[^a-z0-9]/gi, "_");
  const prefix = `landing-assets/${safeUser}/${ctx.machineId}/`;

  try {
    const json = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(prefix)) throw new Error("invalid pathname");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userKey: ctx.email, machineId: ctx.machineId }),
        };
      },
      // DB persistence happens via the persistLandingAsset server action once the
      // client upload resolves (it has blob.url + blob.pathname there). A webhook
      // here isn't reachable in local dev, so we keep this a no-op.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 400 },
    );
  }
}
