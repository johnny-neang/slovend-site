/** Non-functional placeholder CTA: "sign up for text messages". No backend. */
export default function VendCta() {
  return (
    <section className="vend-cta" aria-label="Text message signup">
      <span className="vend-cta-pill">Coming soon</span>
      <h2 className="vend-cta-title">Get texts on drops &amp; specials</h2>
      <p className="vend-cta-sub">
        Sign up to hear about new items and deals at this machine.
      </p>
      <div className="vend-cta-form" aria-hidden="true">
        <input
          type="tel"
          inputMode="tel"
          placeholder="(555) 555-5555"
          disabled
          aria-disabled="true"
        />
        <button type="button" disabled aria-disabled="true">
          Notify me
        </button>
      </div>
    </section>
  );
}
