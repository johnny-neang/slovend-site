import type { Metadata } from "next";
import { getCtx } from "@/lib/dashboard";
import { probeReadEndpoints, WRITE_CAPABILITIES, type Access } from "@/lib/api-status";
import { updateApiCredentials, disconnectApi } from "../actions";

export const metadata: Metadata = { title: "API · Vendai" };
export const dynamic = "force-dynamic";

const ACCESS_LABEL: Record<Access, string> = {
  ok: "Accessible",
  forbidden: "No access",
  unauthorized: "Unauthorized",
  missing: "Not found",
  error: "Unreachable",
  untested: "—",
};

export default async function ApiPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const conn = ctx.conn;
  const reads = conn ? await probeReadEndpoints(conn) : [];
  const maskedToken = conn ? `••••••••${conn.token.slice(-4)}` : "";

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Vendai · Integration</div>
            <h1 className="serif-display">API access</h1>
          </div>
          <span className={`status ${conn ? "live" : "off"}`}>
            <span className="dot" />
            {conn ? "Connected" : "Not connected"}
          </span>
        </div>

        <p className="mcp-intro">
          Vendai reaches your machines through the <strong>Nayax Lynx API</strong> using a token you
          provide. <strong>Nayax is the gatekeeper</strong> — your token&apos;s permissions decide
          which endpoints work and whether you have read or write access. Manage your key below and
          see exactly what it can reach.
        </p>

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-h">Credentials</div>
          {sp.error === "token" && <p className="tax-hint">An API token is required.</p>}
          {sp.saved && <p className="api-saved">Saved.</p>}
          <form action={updateApiCredentials} className="api-form">
            <div className="api-field">
              <label htmlFor="base">Lynx API base URL</label>
              <input id="base" name="base" defaultValue={conn?.base ?? "https://lynx.nayax.com"} />
            </div>
            <div className="api-field">
              <label htmlFor="token">
                API token{" "}
                {conn && <span className="api-cur">· current {maskedToken}</span>}
              </label>
              <input
                id="token"
                name="token"
                type="password"
                autoComplete="off"
                placeholder={conn ? "leave blank to keep current" : "Your Lynx bearer token"}
              />
            </div>
            <div className="api-field">
              <label htmlFor="machineId">
                Default machine ID <span style={{ opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="machineId"
                name="machineId"
                defaultValue={conn?.machineId ?? ""}
                placeholder="e.g. 399448903"
              />
            </div>
            <button type="submit" className="tx-save">
              Save
            </button>
          </form>
          {conn && (
            <form action={disconnectApi} style={{ marginTop: 14 }}>
              <button type="submit" className="api-disconnect">
                Disconnect this account
              </button>
            </form>
          )}
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-h">Read endpoints · your live access</div>
          {conn ? (
            <div className="table-card" style={{ border: "none" }}>
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
                  {reads.map((r) => (
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
          ) : (
            <p className="muted">Add your API token above to test which endpoints you can reach.</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-h">Write endpoints</div>
          <p className="mcp-sub" style={{ marginBottom: 14 }}>
            Vendai is <strong>read-only</strong> — it never changes anything in your account. Write
            access (prices, planograms, routes, products) is governed entirely by your Nayax user
            role. These are listed so you know what exists and that Nayax — not Vendai — controls it.
          </p>
          <div className="table-card" style={{ border: "none" }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Method</th>
                  <th>Type</th>
                  <th>Vendai</th>
                </tr>
              </thead>
              <tbody>
                {WRITE_CAPABILITIES.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="mono">{r.method}</td>
                    <td>
                      <span className="type-write">Write</span>
                    </td>
                    <td>
                      <span className="acc acc-untested">Not used</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
