"use client";

import { useActionState } from "react";
import { runWriteCanary, runRowCanary, type CanaryResult } from "@/app/settings/actions";
import type { WriteReadiness, RowTarget } from "@/lib/planogram-writes";

const initial: CanaryResult = { ran: false };

/**
 * Deliberately NOT folded into <AccessTester>. That panel promises "Nothing is
 * written" and must keep meaning it literally; this one does write. Keeping them
 * visually and physically separate is the point.
 */
export default function WriteCanary({
  connected,
  machineId,
  alreadyVerified,
  readiness,
  rowTargets,
}: {
  connected: boolean;
  machineId: string;
  alreadyVerified: boolean;
  readiness: WriteReadiness | null;
  rowTargets: RowTarget[];
}) {
  // Row-level is the primary path: the whole-map write cannot pass while any
  // slot sits at NayaxProductID 0, and on this machine 31 of them do.
  const [state, formAction, pending] = useActionState(
    rowTargets.length > 0 ? runRowCanary : runWriteCanary,
    initial,
  );
  const ready = state.readiness ?? readiness;
  const rowMode = rowTargets.length > 0;

  const verdict = (() => {
    if (!state.ran || state.error) return null;
    if (state.status === "verified" && state.verifiedUnchanged) {
      return { cls: "acc-granted", text: "Write path verified · planogram unchanged" };
    }
    if (state.status === "mismatch") {
      return { cls: "acc-forbidden", text: "Planogram changed — review below" };
    }
    if (state.status === "applied_unverified") {
      return { cls: "acc-inconclusive", text: "Accepted, but the re-read couldn't confirm it" };
    }
    if (state.status === "failed") {
      return { cls: "acc-forbidden", text: "Rejected — nothing was changed" };
    }
    return { cls: "acc-inconclusive", text: "Inconclusive — see details" };
  })();

  return (
    <div>
      <p className="mcp-sub" style={{ marginBottom: 14 }}>
        {rowMode ? (
          <>
            Sends <strong>one already-mapped slot back to Nayax exactly as it came</strong>, then
            re-reads the whole planogram and compares. A success changes nothing and a failure
            changes nothing. Nayax validates only the rows it&apos;s given, so this works even
            though other slots have no product assigned — unlike a whole-planogram write, which
            they reject outright. Editing prices and par levels stays locked until this passes.
          </>
        ) : (
          <>
            Sends your machine&apos;s <strong>current planogram back to Nayax unchanged</strong>,
            then re-reads it and compares. A success changes nothing and a failure changes nothing —
            what it proves is that the write path works and exactly what Nayax does with it.
          </>
        )}
      </p>

      {alreadyVerified && (
        <p className="api-saved" style={{ marginBottom: 14 }}>
          This machine&apos;s write path is already verified. Re-running is safe.
        </p>
      )}

      {ready && (
        <div className="table-card" style={{ border: "none", marginBottom: 16 }}>
          <table className="dtable">
            <tbody>
              <tr>
                <td>Slots with a product assigned</td>
                <td>
                  <span className={`acc ${ready.canWrite ? "acc-granted" : "acc-forbidden"}`}>
                    {ready.ready} of {ready.total}
                  </span>
                </td>
              </tr>
              {!ready.canWrite && (
                <tr>
                  <td>Blocking writes</td>
                  <td className="mono" style={{ wordBreak: "break-word" }}>
                    {ready.blockedSlots.join(", ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {ready && !ready.canWrite && (
        <p className="tax-hint" style={{ marginBottom: 14 }}>
          Nayax rejects a <em>whole-planogram</em> write if any slot has no product assigned
          (&ldquo;invalid NayaxProductID: 0&rdquo;).{" "}
          {rowMode ? (
            <>
              Single-slot writes are unaffected — {rowTargets.length} slot
              {rowTargets.length === 1 ? "" : "s"} can be edited one at a time right now, and each
              slot you map adds another.
            </>
          ) : (
            <>Assign a product to at least one slot to unlock single-slot editing.</>
          )}
        </p>
      )}

      {!connected ? (
        <p className="tax-hint">Add your API token above first.</p>
      ) : (
        <form action={formAction} className="api-form">
          <div className="api-field">
            <label htmlFor="canary-confirm">
              Type the machine id to confirm{" "}
              <span className="api-cur">· {machineId || "unknown"}</span>
            </label>
            <input
              id="canary-confirm"
              name="confirm"
              autoComplete="off"
              placeholder={machineId || "machine id"}
            />
          </div>
          {rowMode ? (
            <div className="api-field">
              <label htmlFor="canary-slot">Slot to echo back</label>
              <select
                id="canary-slot"
                name="machineProductId"
                defaultValue={String(rowTargets[0]?.machineProductId ?? "")}
              >
                {rowTargets.map((t) => (
                  <option key={t.machineProductId} value={t.machineProductId}>
                    Slot {t.slot}
                    {t.name ? ` · ${t.name}` : ""}
                    {t.price != null ? ` · $${t.price.toFixed(2)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="api-field">
              <label htmlFor="canary-variant">Payload shape</label>
              <select id="canary-variant" name="variant" defaultValue="array">
                <option value="array">Array of rows (as Lynx returns them)</option>
                <option value="wrapped">Wrapped in MachineProducts</option>
              </select>
            </div>
          )}
          <button type="submit" className="tx-save" disabled={pending}>
            {pending ? "Running…" : "Run write canary"}
          </button>
        </form>
      )}

      {state.ran && state.error && (
        <p className="tax-hint" style={{ marginTop: 12 }}>
          {state.error}
        </p>
      )}

      {state.ran && !state.error && (
        <div className="table-card" style={{ border: "none", marginTop: 16 }}>
          <table className="dtable">
            <tbody>
              <tr>
                <td>Result</td>
                <td>
                  {verdict && <span className={`acc ${verdict.cls}`}>{verdict.text}</span>}
                  {state.httpStatus ? (
                    <span className="muted mono"> HTTP {state.httpStatus}</span>
                  ) : (
                    <span className="muted mono"> no response</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>Rows sent</td>
                <td className="mono">
                  {state.rowCount ?? 0}
                  {state.targetSlot ? ` · slot ${state.targetSlot}` : ""}
                </td>
              </tr>
              {state.auditId != null && (
                <tr>
                  <td>Audit record</td>
                  <td className="mono">#{state.auditId}</td>
                </tr>
              )}
              {state.diffLines && state.diffLines.length > 0 && (
                <tr>
                  <td>Changes detected</td>
                  <td className="mono" style={{ whiteSpace: "pre-wrap" }}>
                    {state.diffLines.join("\n")}
                  </td>
                </tr>
              )}
              {state.responseExcerpt ? (
                <tr>
                  <td>Nayax response</td>
                  <td className="mono" style={{ wordBreak: "break-all" }}>
                    {state.responseExcerpt}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {state.ran && !state.error && state.status === "failed" && (
        <p className="mcp-sub" style={{ marginTop: 12 }}>
          Nayax rejected this payload shape. The response above usually names the fields it expected
          — try the other payload shape, or send that text over and it can be adjusted.
        </p>
      )}
    </div>
  );
}
