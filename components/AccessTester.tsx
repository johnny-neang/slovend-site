"use client";

import { useActionState } from "react";
import { testAccess } from "@/app/settings/actions";
import type { Access, AccessResult, EndpointRow } from "@/lib/api-status";

const ACCESS_LABEL: Record<Access, string> = {
  ok: "Accessible",
  granted: "Write access",
  forbidden: "No access",
  unauthorized: "Unauthorized",
  missing: "Not found",
  inconclusive: "Inconclusive",
  error: "Unreachable",
  untested: "—",
};

const initial: AccessResult = { ran: false, rows: [] };

function AccessTable({ rows }: { rows: EndpointRow[] }) {
  return (
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
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {r.label}
                {r.note ? <span className="muted"> · {r.note}</span> : null}
              </td>
              <td className="mono">{r.method}</td>
              <td>
                <span className={r.type === "write" ? "type-write" : "type-read"}>
                  {r.type === "write" ? "Write" : "Read"}
                </span>
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
  );
}

export default function AccessTester({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(testAccess, initial);

  const reads = state.rows.filter((r) => r.type === "read");
  const writes = state.rows.filter((r) => r.type === "write");

  return (
    <div>
      <div className="access-bar">
        <form action={formAction}>
          <button type="submit" className="tx-save" style={{ marginLeft: 0 }} disabled={!connected || pending}>
            {pending ? "Testing…" : state.ran ? "Re-test access" : "Test read & write access"}
          </button>
        </form>
        <span className="muted">
          {!connected
            ? "Add your API token above first."
            : "Runs a live check against each endpoint with your token. Nothing is written."}
        </span>
      </div>

      {state.error && (
        <p className="tax-hint" style={{ marginTop: 12 }}>
          {state.error}
        </p>
      )}

      {state.ran && reads.length > 0 && (
        <>
          <div className="panel-h" style={{ marginTop: 18 }}>
            Read endpoints
          </div>
          <AccessTable rows={reads} />
        </>
      )}

      {state.ran && writes.length > 0 && (
        <>
          <div className="panel-h" style={{ marginTop: 24 }}>
            Write endpoints
          </div>
          <p className="mcp-sub" style={{ marginBottom: 0 }}>
            Write scope is governed entirely by your Nayax role — Slovend Intelligence never
            changes anything in your account. Each probe is aimed at an id that does not exist, so
            it can clear Nayax&apos;s permission check and still be incapable of modifying a real
            record. <strong>&ldquo;Write access&rdquo; means the request passed the permission gate
            and then failed on the missing record</strong> — that is the proof the scope is granted.
          </p>
          <AccessTable rows={writes} />
        </>
      )}
    </div>
  );
}
