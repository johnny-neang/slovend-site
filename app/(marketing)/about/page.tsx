import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slovend — About",
  description:
    "Slovend is a subsidiary of FutureNow, Inc. — a mentorship collective in Sheridan, WY built to unlock potential in people and the things they build. One well-kept machine, plus Slovend Intelligence, our AI layer for fleets.",
};

export default function About() {
  return (
    <>
      <section className="page-hero">
        <div className="page-hero-glow" />
        <div className="wrap">
          <div className="kicker center">Our story</div>
          <h1 className="serif-display">
            The quiet art
            <br />
            <span className="ital">of vending well.</span>
          </h1>
          <p className="lead">
            Slovend is a small company with an old-fashioned idea: that a vending
            machine can be beautiful, well-kept, and genuinely good to find.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: "clamp(40px,6vw,72px)" }}>
        <div className="wrap story">
          <div className="figure">
            <a
              className="plate"
              href="https://futurenow.co"
              target="_blank"
              rel="noopener"
              aria-label="FutureNow, Inc."
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/futurenow-logo.png" alt="FutureNow, Inc." />
            </a>
            <div className="cap">
              <span>FutureNow, Inc.</span>
              <span>Parent company</span>
            </div>
          </div>
          <div className="prose">
            <div className="kicker" style={{ marginBottom: 20 }}>
              Part of FutureNow
            </div>
            <p>
              <span className="drop">S</span>lovend is the work of people who
              believe the everyday is worth doing well. We keep one vending
              machine — Nori, at Arden Fair in Sacramento — stocked with care and
              watched over by the lucky cat, and we&apos;re building{" "}
              <Link
                href="/slovend-intelligence"
                style={{ color: "var(--cherry)", textDecoration: "none" }}
              >
                Slovend Intelligence
              </Link>
              , an AI layer that lets operators talk to their whole fleet in
              plain language.
            </p>
            <p>
              We&apos;re a subsidiary of{" "}
              <b className="gold">FutureNow, Inc.</b>, a mentorship collective in
              Sheridan, Wyoming built on a single idea: that the right
              partnership can unlock the full potential in people — and in the
              things they build. Slovend is where that conviction meets the real
              world.
            </p>
            <p>
              The same care FutureNow gives to growing founders, we give to a
              machine on a mall floor: show up, tend it well, and let good
              fortune follow.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
