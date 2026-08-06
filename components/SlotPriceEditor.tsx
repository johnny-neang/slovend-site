"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewSlotChange,
  applySlotChange,
  type SlotPreview,
  type SlotApply,
} from "@/app/dashboard/inventory/slot-actions";

const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);
const parText = (n: number | null | undefined) => (n == null ? "not set" : String(n));

/**
 * Edit one slot's price and par.
 *
 * Two-step by design: preview is computed on the server and sends nothing, then
 * apply re-reads live state and refuses if the slot moved in between. The slot
 * is addressed by MachineProductID so only that row is submitted.
 */
export default function SlotPriceEditor({
  machineProductId,
  slot,
  name,
  price,
  par,
  canaryVerified,
}: {
  machineProductId: number;
  slot: string;
  name: string;
  price: number | null;
  par: number | null;
  canaryVerified: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [priceInput, setPriceInput] = useState(price == null ? "" : price.toFixed(2));
  const [parInput, setParInput] = useState(par == null ? "" : String(par));
  const [preview, setPreview] = useState<SlotPreview | null>(null);
  const [result, setResult] = useState<SlotApply | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function close() {
    setOpen(false);
    setPreview(null);
    setResult(null);
    setPriceInput(price == null ? "" : price.toFixed(2));
    setParInput(par == null ? "" : String(par));
  }

  function doPreview() {
    start(async () => {
      setResult(null);
      setPreview(await previewSlotChange(machineProductId, { price: priceInput, par: parInput }));
    });
  }

  function doApply() {
    if (!preview?.expected) return;
    start(async () => {
      const r = await applySlotChange(
        machineProductId,
        { price: priceInput, par: parInput },
        preview.expected!,
      );
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="inv-edit-btn" onClick={() => setOpen(true)}>
        Price
      </button>

      {open && (
        <div className="pm-overlay" onClick={close}>
          <div className="pm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pm-head">
              <span>
                Slot {slot}
                {name ? ` · ${name}` : ""}
              </span>
              <button type="button" className="pm-x" onClick={close} aria-label="Close">
                ×
              </button>
            </div>

            {!canaryVerified && (
              <p className="tax-hint">
                Editing is locked until the write canary passes on Settings → API. It proves the
                write path without changing anything.
              </p>
            )}

            <div className="pm-field">
              <span>Price</span>
              <input
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => {
                  setPriceInput(e.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                aria-label={`Price for slot ${slot}`}
                disabled={!canaryVerified || pending}
              />
            </div>

            <div className="pm-field">
              <span>Par level</span>
              <input
                inputMode="numeric"
                value={parInput}
                placeholder="not set"
                onChange={(e) => {
                  setParInput(e.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                aria-label={`Par level for slot ${slot}`}
                disabled={!canaryVerified || pending}
              />
            </div>

            <p className="pm-note">
              Currently {money(price)} · par {parText(par)}. Saved to Nayax; the machine picks it up
              on its next sync.
            </p>

            {preview && !preview.ok && <p className="tax-hint">{preview.error}</p>}

            {preview?.ok && !result && (
              <div className="table-card" style={{ border: "none", margin: "12px 0" }}>
                <table className="dtable">
                  <tbody>
                    {preview.newPrice != null && (
                      <tr>
                        <td>Price</td>
                        <td className="mono">
                          {money(preview.currentPrice)} → <strong>{money(preview.newPrice)}</strong>
                        </td>
                      </tr>
                    )}
                    {preview.newPar != null && (
                      <tr>
                        <td>Par</td>
                        <td className="mono">
                          {parText(preview.currentPar)} → <strong>{preview.newPar}</strong>
                        </td>
                      </tr>
                    )}
                    {preview.unchanged && (
                      <tr>
                        <td colSpan={2} className="muted">
                          Nothing would change.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {result && (
              <div style={{ margin: "12px 0" }}>
                <span
                  className={`acc ${
                    result.status === "verified"
                      ? "acc-granted"
                      : result.status === "stale" || result.status === "blocked"
                        ? "acc-inconclusive"
                        : "acc-forbidden"
                  }`}
                >
                  {result.status === "verified" && "Saved"}
                  {result.status === "ignored" && "Accepted but nothing changed"}
                  {result.status === "applied_unverified" && "Accepted, unconfirmed"}
                  {result.status === "mismatch" && "Unexpected change"}
                  {result.status === "stale" && "Changed in Nayax"}
                  {result.status === "blocked" && "Blocked"}
                  {result.status === "failed" && "Rejected"}
                  {result.status === "unknown" && "Unknown"}
                  {result.status === "noop" && "Nothing to change"}
                </span>
                {result.httpStatus ? (
                  <span className="muted mono"> HTTP {result.httpStatus}</span>
                ) : null}
                {result.error && <p className="tax-hint">{result.error}</p>}
                {result.status === "ignored" && (
                  <p className="pm-note">
                    Nayax returned success, but re-reading the planogram shows the price unchanged —
                    it accepted the request and discarded the field. The price on the machine has
                    NOT moved. This usually means the writable field name differs from the one we
                    send; send this over and it can be corrected.
                  </p>
                )}
                {result.status === "applied_unverified" && (
                  <p className="pm-note">
                    Nayax accepted the write but the re-read couldn&apos;t confirm it. Check the
                    planogram before retrying — don&apos;t assume it failed.
                  </p>
                )}
                {result.status === "stale" && result.liveNow && (
                  <p className="pm-note">
                    It&apos;s now {money(result.liveNow.price)} · par {parText(result.liveNow.par)}.
                    Preview again to work from the current value.
                  </p>
                )}
                {result.responseExcerpt && result.status === "failed" && (
                  <p className="pm-note mono" style={{ wordBreak: "break-all" }}>
                    {result.responseExcerpt}
                  </p>
                )}
                {result.diffLines && result.diffLines.length > 0 && result.status === "mismatch" && (
                  <p className="pm-note mono" style={{ whiteSpace: "pre-wrap" }}>
                    {result.diffLines.join("\n")}
                  </p>
                )}
              </div>
            )}

            <div className="pm-actions">
              <span className="pm-spacer" />
              <button type="button" className="pm-cancel" onClick={close}>
                {result?.ok ? "Done" : "Cancel"}
              </button>
              {!result?.ok &&
                (preview?.ok && !preview.unchanged ? (
                  <button
                    type="button"
                    className="pm-save"
                    onClick={doApply}
                    disabled={pending || !canaryVerified}
                  >
                    {pending ? "Saving…" : "Confirm and save"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pm-save"
                    onClick={doPreview}
                    disabled={pending || !canaryVerified}
                  >
                    {pending ? "Checking…" : "Preview change"}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
