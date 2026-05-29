import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slovend — Locations",
  description:
    "Where to find a Slovend machine. One machine, lovingly kept — more on the way.",
};

export default function Locations() {
  return (
    <>
      <section className="page-hero locations">
        <div className="page-hero-glow" />
        <div className="wrap">
          <div className="kicker center">Find us</div>
          <h1 className="serif-display">
            Where to find
            <br />
            <span className="ital">our machine.</span>
          </h1>
          <p className="note" style={{ marginTop: 20 }}>
            (more is coming)
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: "clamp(40px,6vw,72px)" }}>
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="loc featured">
            <div className="loc-top">
              <div>
                <div className="city">Sacramento, CA</div>
                <h3>Nori</h3>
              </div>
              <span className="status live">
                <span className="dot" />
                Live now
              </span>
            </div>
            <p className="addr">
              Arden Fair Mall
              <br />
              1689 Arden Way, Sacramento, CA 95815
            </p>
            <div className="meta">
              <span>Mon–Sat 10am–8pm · Sun 11am–7pm</span>
              <a
                href="https://maps.google.com/?q=1689+Arden+Way+Sacramento+CA+95815"
                target="_blank"
                rel="noopener"
                className="maplink"
              >
                Get directions →
              </a>
            </div>
          </div>
          <p className="note">One machine, lovingly kept · more on the way</p>
        </div>
      </section>
    </>
  );
}
