"use client";

import { useState, useTransition } from "react";
import { submitVendingFeedback } from "@/app/vending/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VendFeedback({ handle }: { handle: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("handle", handle);
    const email = String(fd.get("email") ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      setEmailErr(true);
      setErr("Please enter a valid email.");
      return;
    }
    setEmailErr(false);
    setErr(null);
    start(async () => {
      const r = await submitVendingFeedback(fd);
      if (r.ok) setDone(true);
      else setErr(r.error ?? "Something went wrong.");
    });
  }

  if (done) {
    return (
      <section className="vend-fb">
        <div className="vend-fb-done">
          <div className="vend-fb-seal">✦</div>
          <h2>Thanks!</h2>
          <p>We&apos;ll take your suggestion to heart.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vend-fb" aria-label="Feedback">
      <h2 className="vend-fb-title">Help us grow</h2>
      <p className="vend-fb-sub">Is there something here you&apos;d like to see?</p>
      <form className="vend-fb-form" onSubmit={onSubmit}>
        {/* honeypot — visually hidden; bots fill it, humans don't */}
        <input
          type="text"
          name="company"
          className="vend-fb-hp"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <label className="vend-fb-field">
          <span>Name</span>
          <input name="name" placeholder="Your name" autoComplete="name" />
        </label>
        <label className="vend-fb-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            placeholder="you@email.com"
            autoComplete="email"
            className={emailErr ? "err" : undefined}
          />
        </label>
        <label className="vend-fb-field">
          <span>What would you like to see?</span>
          <input name="product" placeholder="e.g. Sparkling water, protein bars…" />
        </label>
        {err && <p className="vend-fb-error">{err}</p>}
        <button type="submit" className="vend-fb-submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
