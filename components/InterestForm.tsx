"use client";

import { useState } from "react";
import { submitInterest } from "@/app/(marketing)/actions";

export default function InterestForm() {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) {
      setErr(true);
      (form.elements.namedItem("email") as HTMLInputElement | null)?.focus();
      return;
    }
    setErr(false);
    setSendError(null);
    setSubmitting(true);
    try {
      const result = await submitInterest(fd);
      if (!result.ok) {
        setSendError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setSendError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="form-success show">
        <div className="seal">✦</div>
        <h3>You&apos;re on the list.</h3>
        <p>
          Thanks — we&apos;ve noted your interest in Vendai. We&apos;ll be in
          touch as we open the beta. Good fortune until then.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="form-head" id="formHead">
        <div className="kicker center" style={{ justifyContent: "center" }}>
          Early access
        </div>
        <h2>Be first in line for Vendai.</h2>
        <p className="lead" style={{ margin: "14px auto 0", maxWidth: 440 }}>
          Tell us a little about your fleet and we&apos;ll reach out as we open
          up the beta.
        </p>
      </div>

      <form id="interestForm" noValidate onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              className={err ? "err" : undefined}
              onInput={() => setErr(false)}
            />
          </div>
          <div className="field">
            <label htmlFor="company">Company</label>
            <input
              type="text"
              id="company"
              name="company"
              placeholder="Company or operator name"
              autoComplete="organization"
            />
          </div>
          <div className="field">
            <label htmlFor="fleet">Fleet size</label>
            <select id="fleet" name="fleet" defaultValue="">
              <option value="">Select…</option>
              <option>1–10 machines</option>
              <option>11–50 machines</option>
              <option>51–200 machines</option>
              <option>200+ machines</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="system">Current system / provider</label>
            <select id="system" name="system" defaultValue="">
              <option value="">Select…</option>
              <option>Nayax</option>
              <option>Cantaloupe / Seed</option>
              <option>Crane / Streamware</option>
              <option>Other</option>
              <option>Not sure yet</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="message">
              What would you want Vendai to do?{" "}
              <span style={{ opacity: 0.6 }}>(optional)</span>
            </label>
            <textarea
              id="message"
              name="message"
              placeholder="e.g. one place to see sales and low-stock across all my sites"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-gold" disabled={submitting}>
              {submitting ? "Sending…" : "Request early access"}
            </button>
            <span className="fine">
              No spam. We&apos;ll only email you about the Vendai beta.
            </span>
            {sendError ? (
              <span className="auth-error" role="alert">
                {sendError}
              </span>
            ) : null}
          </div>
        </div>
      </form>
    </>
  );
}
