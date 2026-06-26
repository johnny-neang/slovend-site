"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Asset = { assetId: string; mediaType: "image" | "video"; blobUrl: string };

export default function VendCarousel({ assets }: { assets: Asset[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  // Which video (by assetId) currently has sound; null means all muted.
  const [soundOn, setSoundOn] = useState<string | null>(null);
  const soundOnRef = useRef<string | null>(null);
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const setSound = useCallback((id: string | null) => {
    soundOnRef.current = id;
    setSoundOn(id);
  }, []);

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
    // Auto-advance is paused while sound is on, so onScroll firing here means a
    // manual swipe — re-mute the sound video once a different card is centred.
    if (soundOnRef.current && assets[best]?.assetId !== soundOnRef.current) {
      const v = videosRef.current.get(soundOnRef.current);
      if (v) v.muted = true;
      setSound(null);
      pausedRef.current = false;
    }
  }, [assets, setIdx, setSound]);

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
  // Don't resume auto-advance while a video is unmuted (the sound button's
  // pointer events bubble to the track and would otherwise trigger resume).
  const resume = () => { if (!soundOnRef.current) pausedRef.current = false; };

  const toggleSound = (assetId: string) => {
    const vids = videosRef.current;
    const target = vids.get(assetId);
    if (!target) return;
    if (soundOnRef.current === assetId) {
      target.muted = true;
      setSound(null);
      pausedRef.current = false;
    } else {
      vids.forEach((v, id) => { if (id !== assetId) v.muted = true; });
      target.muted = false;
      target.play?.().catch(() => {});
      setSound(assetId);
      pausedRef.current = true;
    }
  };

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
              <>
                <video
                  ref={(el) => {
                    if (el) videosRef.current.set(a.assetId, el);
                    else videosRef.current.delete(a.assetId);
                  }}
                  src={a.blobUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
                <button
                  type="button"
                  className={`vend-sound${soundOn === a.assetId ? " is-on" : ""}`}
                  aria-label={soundOn === a.assetId ? "Mute video" : "Play sound"}
                  aria-pressed={soundOn === a.assetId}
                  onClick={() => toggleSound(a.assetId)}
                >
                  {soundOn === a.assetId ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 9v6h4l5 5V4L7 9H3z" />
                      <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z" />
                      <path d="M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 9v6h4l5 5V4L7 9H3z" />
                      <path d="M19 12l3-3-1.4-1.4L17.6 10.6 14.8 7.8 13.4 9.2 16.2 12l-2.8 2.8 1.4 1.4 2.8-2.8 3 3L22 18l-3-3z" />
                    </svg>
                  )}
                </button>
              </>
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
