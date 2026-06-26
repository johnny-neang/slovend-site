"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Asset = { assetId: string; mediaType: "image" | "video"; blobUrl: string };

export default function VendCarousel({ assets }: { assets: Asset[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  const setIdx = useCallback((i: number) => {
    activeRef.current = i;
    setActive((prev) => (prev === i ? prev : i));
  }, []);

  // Centre card i in the track. Updates the active index immediately so the dots
  // reflect intent even if the (smooth) scroll is animated/deferred.
  const goTo = useCallback(
    (i: number) => {
      const track = trackRef.current;
      if (!track) return;
      setIdx(i);
      const card = track.querySelectorAll<HTMLElement>(".vend-card")[i];
      if (!card) return;
      const left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
      track.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    },
    [setIdx],
  );

  // Manual swipe: derive the active dot from scroll position (card nearest centre).
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const cards = track.querySelectorAll<HTMLElement>(".vend-card");
    if (!cards.length) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best !== activeRef.current) setIdx(best);
  }, [setIdx]);

  useEffect(() => {
    if (assets.length < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      goTo((activeRef.current + 1) % assets.length);
    }, 4000);
    return () => clearInterval(id);
  }, [assets.length, goTo]);

  if (!assets.length) return null;

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  return (
    <div className="vend-carousel-wrap">
      <div
        className="vend-carousel"
        ref={trackRef}
        onScroll={onScroll}
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

      {assets.length > 1 && (
        <div className="vend-dots" role="tablist" aria-label="Media">
          {assets.map((a, i) => (
            <button
              key={a.assetId}
              type="button"
              className={`vend-dot${i === active ? " is-active" : ""}`}
              aria-label={`Go to item ${i + 1} of ${assets.length}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
