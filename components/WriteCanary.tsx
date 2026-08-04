"use client";

import { useActionState } from "react";
import { runWriteCanary, type CanaryResult } from "@/app/settings/actions";

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
}: {
  connected: boolean;
  machineId: string;
  alreadyVerified: boolean;
}) {
  const [state, formAction, pending] = useActionState(runWriteCanary, initial);

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
        Sends your machine&apos;s <strong>current planogram back to Nayax unchanged</strong>, then
        re-reads it and compares. A success changes nothing and a failure changes nothing — what it
        proves is that the write path works and exactly what Nayax does with it. Editing prices and
        par levels stays locked until this passes.
      </p>

      {alreadyVerified && (
        <p className="api-saved" style={{ marginBottom: 14 }}>
          This machine&apos;s write path is already verified. Re-running is safe.
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
          <div className="api-field">
            <label htmlFor="canary-variant">Payload shape</label>
            <select id="canary-variant" name="variant" defaultValue="array">
              <option value="array">Array of rows (as Lynx returns them)</option>
              <option value="wrapped">Wrapped in MachineProducts</option>
            </select>
          </div>
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
                <td className="mono">{state.rowCount ?? 0}</td>
              </tr>
              <tr>
                <td>Payload shape</td>
                <td className="mono">{state.variant}</td>
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
