import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slovend — Good fortune, freshly vended",
  description:
    "One beautifully kept vending machine, stocked with care and watched over by the lucky cat.",
};

export default function Home() {
  return (
    <section className="hero">
      <div className="hero-glow" />
      <div className="hero-frame" />

      <div className="hero-inner">
        <div className="kicker center">Inviting Fortune Since 2025</div>
        <h1 className="serif-display">
          Good fortune,
          <br />
          <span className="ital">freshly vended.</span>
        </h1>
        <p className="lead">
          One beautifully kept vending machine, stocked with care and watched
          over by the lucky cat.
        </p>
        <div className="hero-cta">
          <Link href="/locations" className="btn btn-gold">
            Find our machine
          </Link>
        </div>
      </div>
    </section>
  );
}
