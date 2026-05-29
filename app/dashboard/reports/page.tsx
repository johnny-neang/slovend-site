import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports · Vendai" };

export default function ReportsPage() {
  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Vendai dashboard</div>
            <h1 className="serif-display">Reports</h1>
          </div>
        </div>
        <div className="empty-state">
          <div className="seal">✦</div>
          <h2>Reports are on the way</h2>
          <p>
            We&apos;re wiring up automatic sales polling to compile revenue
            trends, top sellers, payment mix and history. This view lights up
            once data starts collecting.
          </p>
        </div>
      </div>
    </section>
  );
}
