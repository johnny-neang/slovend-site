"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import CopyField from "@/components/CopyField";
import QrCard from "@/components/QrCard";
import BarChart from "@/components/BarChart";
import type { ScanStats } from "@/lib/landing";
import {
  saveLandingConfig,
  persistLandingAsset,
  removeLandingAsset,
  reorderLandingAssetsAction,
  checkSlug,
} from "@/app/dashboard/landing/actions";

type Asset = { assetId: string; mediaType: "image" | "video"; blobUrl: string; orderIdx: number };

type Props = {
  machineNumber: string;
  enabled: boolean;
  title: string | null;
  slug: string | null;
  location: string | null;
  publicUrl: string;
  trackingUrl: string;
  qrLabel: string;
  scanStats: ScanStats;
  uploadPrefix: string; // landing-assets/<safeUser>/<machineId>/
  assets: Asset[];
  errorCode?: string | null;
};

function extOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return fromType && /^[a-z0-9]{2,5}$/i.test(fromType) ? fromType.toLowerCase() : "bin";
}

export default function LandingManager({
  machineNumber,
  enabled,
  title,
  slug,
  location,
  publicUrl,
  trackingUrl,
  qrLabel,
  scanStats,
  uploadPrefix,
  assets,
  errorCode,
}: Props) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [reordering, startReorder] = useTransition();

  const [slugVal, setSlugVal] = useState(slug ?? "");
  const [slugHint, setSlugHint] = useState<{ ok: boolean; reason?: string } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Debounced slug availability check.
  useEffect(() => {
    const v = slugVal.trim();
    const t = setTimeout(async () => {
      if (!v) { setSlugHint(null); return; }
      try {
        const r = await checkSlug(v);
        setSlugHint({ ok: r.ok, reason: r.reason });
      } catch {
        setSlugHint(null);
      }
    }, v ? 400 : 0);
    return () => clearTimeout(t);
  }, [slugVal]);

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startSave(async () => {
      await saveLandingConfig(fd);
      router.refresh();
    });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    setProgress(0);
    const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const pathname = `${uploadPrefix}${crypto.randomUUID()}.${extOf(file)}`;
    try {
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/landing/blob-upload",
        contentType: file.type,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      await persistLandingAsset({ blobUrl: blob.url, blobPath: blob.pathname, mediaType });
      router.refresh();
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...assets];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    const ids = next.map((a) => a.assetId);
    startReorder(async () => {
      await reorderLandingAssetsAction(ids);
      router.refresh();
    });
  }

  function remove(assetId: string) {
    startReorder(async () => {
      await removeLandingAsset(assetId);
      router.refresh();
    });
  }

  return (
    <div className="lp-grid">
      {/* Config panel */}
      <form className="panel lp-config" onSubmit={onSave}>
        <h2 className="panel-title">Publish</h2>

        <label className="lp-switch">
          <input type="checkbox" name="enabled" defaultChecked={enabled} />
          <span>Make this machine&apos;s page public</span>
        </label>

        <label className="pm-field">
          <span>Header title (optional)</span>
          <input name="title" defaultValue={title ?? ""} placeholder="e.g. Snacks &amp; Drinks" />
          <span className="lp-hint muted">
            Shown at the top of the public page. Falls back to the slug, then the machine number.
          </span>
        </label>

        <label className="pm-field">
          <span>Custom URL slug (optional)</span>
          <input
            name="slug"
            value={slugVal}
            onChange={(e) => setSlugVal(e.target.value)}
            placeholder="e.g. dtla-snacks"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {slugVal.trim() ? (
            <span className={`lp-hint ${slugHint?.ok ? "ok" : slugHint ? "bad" : ""}`}>
              {slugHint
                ? slugHint.ok
                  ? "✓ Available"
                  : `✗ ${slugHint.reason}`
                : "Checking…"}
            </span>
          ) : (
            <span className="lp-hint muted">
              Falls back to the machine number ({machineNumber || "—"}).
            </span>
          )}
        </label>

        <label className="pm-field">
          <span>Location line (optional)</span>
          <input name="location" defaultValue={location ?? ""} placeholder="e.g. Lobby · 7th & Main" />
        </label>

        {errorCode === "slug_taken" && (
          <p className="lp-error">That URL is already taken — pick another.</p>
        )}
        {errorCode === "slug_invalid" && (
          <p className="lp-error">That slug isn&apos;t valid (3–48 chars, letters/numbers/dashes).</p>
        )}

        <button type="submit" className="pm-save" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>

        <div className="lp-url">
          <span className="lp-url-label">Public URL{enabled ? "" : " (publish to activate)"}</span>
          <CopyField value={publicUrl} />
          <a className="lp-preview" href={publicUrl} target="_blank" rel="noopener noreferrer">
            Preview ↗
          </a>
        </div>

        <p className="note" style={{ marginTop: 4 }}>
          Product photos, names &amp; descriptions are managed on the{" "}
          <a href="/dashboard/inventory?view=grid">Inventory tab</a>.
        </p>
      </form>

      {/* Right column: media upload, with Share & QR + scans beneath it */}
      <div className="lp-col">
      {/* Carousel assets panel */}
      <div className="panel lp-assets">
        <h2 className="panel-title">Carousel (9:16 video / image)</h2>
        <p className="note" style={{ marginTop: 0 }}>
          Portrait assets that auto-scroll at the bottom of the public page.
        </p>

        <label className="lp-upload">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            onChange={onPickFile}
            disabled={uploading}
          />
          <span className="inv-edit-btn">{uploading ? `Uploading… ${progress}%` : "Add asset"}</span>
        </label>
        {uploadErr && <p className="lp-error">{uploadErr}</p>}

        {assets.length ? (
          <ul className="lp-asset-list">
            {assets.map((a, i) => (
              <li key={a.assetId} className="lp-asset">
                <div className="lp-asset-thumb">
                  {a.mediaType === "video" ? (
                    <video src={a.blobUrl} muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.blobUrl} alt="" />
                  )}
                </div>
                <span className="lp-asset-type">{a.mediaType}</span>
                <span className="lp-asset-actions">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || reordering} aria-label="Move up">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === assets.length - 1 || reordering} aria-label="Move down">↓</button>
                  <button type="button" className="lp-del" onClick={() => remove(a.assetId)} disabled={reordering}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>No assets yet.</p>
        )}
      </div>

      {/* Share & QR + scans (combined), beneath the media upload */}
      <div className="panel lp-sharescans">
        <h2 className="panel-title">Share &amp; QR</h2>
        <QrCard trackingUrl={trackingUrl} label={qrLabel} />
        <p className="note" style={{ marginTop: 4 }}>
          The QR opens a short tracked link that counts each scan, then forwards to your page.
        </p>

        <div className="lp-subsection">
          <h2 className="panel-title">QR scans</h2>
          <div className="lp-stats">
            <div className="tile">
              <div className="l">Total</div>
              <div className="n">{scanStats.total.toLocaleString()}</div>
            </div>
            <div className="tile">
              <div className="l">Last 7 days</div>
              <div className="n">{scanStats.last7.toLocaleString()}</div>
            </div>
            <div className="tile">
              <div className="l">Last 30 days</div>
              <div className="n">{scanStats.last30.toLocaleString()}</div>
            </div>
          </div>
          {scanStats.daily.some((d) => d.value > 0) ? (
            <div style={{ marginTop: 14 }}>
              <BarChart data={scanStats.daily} tone="light" height={120} />
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              No scans yet — share your QR to get started.
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
