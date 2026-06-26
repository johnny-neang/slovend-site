"use client";

import { useEffect, useRef } from "react";

type Asset = { assetId: string; mediaType: "image" | "video"; blobUrl: string };

export default function VendCarousel({ assets }: { assets: Asset[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (assets.length < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const id = setInterval(() => {
      const track = trackRef.current;
      if (!track || pausedRef.current) return;
      const cards = track.querySelectorAll<HTMLElement>(".vend-card");
      if (!cards.length) return;
      // Find the next card whose left edge is past the current scroll position.
      const x = track.scrollLeft + 1;
      let next: HTMLElement | null = null;
      for (const c of cards) {
        if (c.offsetLeft > x) { next = c; break; }
      }
      const target = next ? next.offsetLeft : 0; // wrap to start
      track.scrollTo({ left: target, behavior: "smooth" });
    }, 4000);

    return () => clearInterval(id);
  }, [assets.length]);

  if (!assets.length) return null;

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  return (
    <div
      className="vend-carousel"
      ref={trackRef}
      onPointerDown={pause}
      onPointerUp={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {assets.map((a) => (
        <div className="vend-card" key={a.assetId}>
          {a.mediaType === "video" ? (
            <video src={a.blobUrl} autoPlay muted loop playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.blobUrl} alt="" loading="lazy" />
          )}
        </div>
      ))}
    </div>
  );
}
