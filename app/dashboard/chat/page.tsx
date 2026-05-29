import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat · Vendai" };

export default function ChatPage() {
  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Vendai dashboard</div>
            <h1 className="serif-display">Chat</h1>
          </div>
        </div>
        <div className="empty-state">
          <div className="seal">✦</div>
          <h2>Talk to your machine — soon</h2>
          <p>
            A Claude Haiku assistant that reads your machine&apos;s live sales,
            stock and alerts and answers in plain language is coming next.
          </p>
        </div>
      </div>
    </section>
  );
}
