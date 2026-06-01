"use client";

import { useActionState } from "react";
import { testAccess } from "@/app/settings/actions";
import type { Access, AccessResult } from "@/lib/api-status";

const ACCESS_LABEL: Record<Access, string> = {
  ok: "Accessible",
  forbidden: "No access",
  unauthorized: "Unauthorized",
  missing: "Not found",
  error: "Unreachable",
  untested: "—",
};

const initial: AccessResult = { ran: false, rows: [] };

export default function AccessTester({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(testAccess, initial);

  return (
    <div>
      <div className="access-bar">
        <form action={formAction}>
          <button type="submit" className="tx-save" style={{ marginLeft: 0 }} disabled={!connected || pending}>
            {pending ? "Testing…" : state.ran ? "Re-test access" : "Test access"}
          </button>
        </form>
        <span className="muted">
          {!connected
            ? "Add your API token above first."
            : "Runs a live check against each endpoint with your token."}
        </span>
      </div>

      {state.error && (
        <p className="tax-hint" style={{ marginTop: 12 }}>
          {state.error}
        </p>
      )}

      {state.ran && state.rows.length > 0 && (
        <div className="table-card" style={{ border: "none", marginTop: 14 }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Method</th>
                <th>Type</th>
                <th>Your access</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.label}
                    {r.note ? <span className="muted"> · {r.note}</span> : null}
                  </td>
                  <td className="mono">{r.method}</td>
                  <td>
                    <span className="type-read">Read</span>
                  </td>
                  <td>
                    <span className={`acc acc-${r.access}`}>{ACCESS_LABEL[r.access]}</span>
                    {r.code ? <span className="muted mono"> {r.code}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
