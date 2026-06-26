"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

const COLORS = { dark: "#181513", light: "#ffffff" } as const;

export default function QrCard({
  trackingUrl,
  label,
}: {
  trackingUrl: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    QRCode.toCanvas(c, trackingUrl, {
      width: 200,
      margin: 1,
      color: COLORS,
      errorCorrectionLevel: "M",
    })
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, [trackingUrl]);

  const fileBase =
    (label || "slovend").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "slovend";

  function triggerDownload(href: string, name: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadPng() {
    const dataUrl = await QRCode.toDataURL(trackingUrl, {
      width: 1024,
      margin: 2,
      color: COLORS,
      errorCorrectionLevel: "M",
    });
    triggerDownload(dataUrl, `${fileBase}-qr.png`);
  }

  async function downloadSvg() {
    const svg = await QRCode.toString(trackingUrl, {
      type: "svg",
      margin: 2,
      color: COLORS,
      errorCorrectionLevel: "M",
    });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    triggerDownload(url, `${fileBase}-qr.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="lp-qr">
      <div className="lp-qr-frame">
        <canvas ref={canvasRef} className="lp-qr-canvas" aria-label={`QR code for ${label}`} />
      </div>
      <p className="lp-qr-cap">Scan to open this machine&apos;s page. Counts as a QR scan.</p>
      <div className="lp-qr-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={downloadPng} disabled={!ready}>
          Download PNG
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={downloadSvg} disabled={!ready}>
          Download SVG
        </button>
      </div>
    </div>
  );
}
