import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import LandingManager from "@/components/LandingManager";
import { getLandingConfig, listLandingAssets, getLandingScanStats } from "@/lib/landing";

export const metadata: Metadata = { title: "Landing Page · Slovend Intelligence" };
export const dynamic = "force-dynamic";

type SP = { error?: string };

export default async function LandingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await getCtx();
  if (!ctx.conn) redirect("/dashboard");
  if (ctx.error || !ctx.machine)
    return (
      <DashError
        title={ctx.error ? "Couldn't reach Nayax" : "No machines found"}
        message={ctx.error ?? "No machines returned for this account."}
      />
    );

  const sp = await searchParams;
  const machineNumber = String(ctx.machine.MachineNumber ?? "");
  const config = ctx.email ? await getLandingConfig(ctx.email, ctx.machineId) : null;
  const assets = ctx.email ? await listLandingAssets(ctx.email, ctx.machineId) : [];
  const scanStats = ctx.email
    ? await getLandingScanStats(ctx.email, ctx.machineId)
    : { total: 0, last7: 0, last30: 0, daily: [] };

  const origin = (process.env.AUTH_URL ?? "https://www.slovend.com").replace(/\/$/, "");
  const handle = config?.slug || machineNumber;
  const publicUrl = `${origin}/vending/${handle}`;
  const trackingUrl = `${origin}/q/${handle}`;
  const qrLabel = config?.title || config?.slug || machineNumber || "slovend";
  const safeUser = (ctx.email ?? "").replace(/[^a-z0-9]/gi, "_");
  const uploadPrefix = `landing-assets/${safeUser}/${ctx.machineId}/`;

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machineLabel(ctx.machine)}</div>
            <h1 className="serif-display">Landing Page</h1>
          </div>
          <span className={`status ${config?.enabled ? "live" : "off"}`}>
            <span className="dot" />
            {config?.enabled ? "Published" : "Draft"}
          </span>
        </div>

        <LandingManager
          machineNumber={machineNumber}
          enabled={config?.enabled ?? false}
          title={config?.title ?? null}
          slug={config?.slug ?? null}
          location={config?.location ?? null}
          publicUrl={publicUrl}
          trackingUrl={trackingUrl}
          qrLabel={qrLabel}
          scanStats={scanStats}
          uploadPrefix={uploadPrefix}
          assets={assets.map((a) => ({
            assetId: a.assetId,
            mediaType: a.mediaType,
            blobUrl: a.blobUrl,
            orderIdx: a.orderIdx,
          }))}
          errorCode={sp.error ?? null}
        />
      </div>
    </section>
  );
}
