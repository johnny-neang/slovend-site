import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConnection } from "@/lib/connections";
import { getProductMedia } from "@/lib/product-media";
import { buildInventoryRows } from "@/lib/inventory-view";
import type { CatalogProduct } from "@/lib/nayax";
import {
  resolveLanding,
  getLandingConfig,
  getCachedPlanogram,
  listLandingAssets,
} from "@/lib/landing";
import VendGrid, { type VendProduct } from "@/components/vending/VendGrid";
import VendCarousel from "@/components/vending/VendCarousel";
import VendCta from "@/components/vending/VendCta";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const resolved = await resolveLanding(handle);
  if (!resolved) return { title: "Slovend" };
  const config = await getLandingConfig(resolved.userKey, resolved.machineId);
  const name = config?.machineName || "Vending";
  return { title: `${name} · Slovend`, robots: { index: false } };
}

export default async function VendingPage({ params }: PageProps) {
  const { handle } = await params;

  const resolved = await resolveLanding(handle);
  if (!resolved) notFound();
  const { userKey, machineId } = resolved;

  const conn = await getConnection(userKey);
  if (!conn) notFound();

  const [config, planogram, media, assets] = await Promise.all([
    getLandingConfig(userKey, machineId),
    getCachedPlanogram(machineId, conn),
    getProductMedia(userKey, machineId),
    listLandingAssets(userKey, machineId),
  ]);

  const catalog = new Map<number, CatalogProduct>(planogram.catalogEntries);
  const rows = buildInventoryRows({ products: planogram.products, media, catalog });

  const products: VendProduct[] = rows
    .filter((r) => r.slot !== "—")
    .map((r) => ({
      id: r.key,
      name: r.name,
      price: r.price,
      image: r.image,
      description: r.description,
      out: r.out,
    }));

  const machineName = config?.machineName || "Our machine";
  const location = config?.location || "";

  return (
    <main className="vend">
      <header className="vend-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="vend-wordmark" src="/assets/slovend-wordmark.png" alt="Slovend" />
        <h1 className="vend-machine-name">{machineName}</h1>
        {location ? <p className="vend-location">{location}</p> : null}
      </header>

      {products.length ? (
        <VendGrid products={products} />
      ) : (
        <p className="vend-empty">Menu is being updated — check back shortly.</p>
      )}

      <VendCarousel
        assets={assets.map((a) => ({
          assetId: a.assetId,
          mediaType: a.mediaType,
          blobUrl: a.blobUrl,
        }))}
      />

      <VendCta />

      <footer className="vend-foot">Powered by Slovend</footer>
    </main>
  );
}
