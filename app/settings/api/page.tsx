import type { Metadata } from "next";
import { getCtx } from "@/lib/dashboard";
import {
  updateApiCredentials,
  disconnectApi,
  canaryVerifiedForCurrentMachine,
  writeReadinessForCurrentMachine,
  catalogSummaryForCurrentMachine,
} from "../actions";
import AccessTester from "@/components/AccessTester";
import WriteCanary from "@/components/WriteCanary";

export const metadata: Metadata = { title: "API · Slovend Intelligence" };
export const dynamic = "force-dynamic";

export default async function ApiPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const conn = ctx.conn;
  const [canaryVerified, writeState, catalog] = conn
    ? await Promise.all([
        canaryVerifiedForCurrentMachine(),
        writeReadinessForCurrentMachine(),
        catalogSummaryForCurrentMachine(),
      ])
    : [false, null, null];
  const maskedToken = conn ? `••••••••${conn.token.slice(-4)}` : "";

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Slovend Intelligence · Integration</div>
            <h1 className="serif-display">API access</h1>
          </div>
          <span className={`status ${conn ? "live" : "off"}`}>
            <span className="dot" />
            {conn ? "Connected" : "Not connected"}
          </span>
        </div>

        <p className="mcp-intro">
          Slovend Intelligence reaches your machines through the <strong>Nayax Lynx API</strong> using a token you
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
          <div className="panel-h">Your live access</div>
          <AccessTester connected={Boolean(conn)} />
        </div>

        {catalog && (
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-h">Your Nayax product catalog</div>
            <p className="mcp-sub" style={{ marginBottom: 14 }}>
              The products a slot can be mapped to. Mapping the{" "}
              {writeState?.readiness.blockedSlots.length ?? 0} unassigned slots is only meaningful if
              there are real products here to map them to.
            </p>
            <div className="table-card" style={{ border: "none", marginBottom: 14 }}>
              <table className="dtable">
                <tbody>
                  <tr>
                    <td>Products in catalog</td>
                    <td>
                      <span className={`acc ${catalog.total > 0 ? "acc-granted" : "acc-forbidden"}`}>
                        {catalog.total}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>With a picture set</td>
                    <td className="mono">
                      {catalog.withPicture} of {catalog.total}
                    </td>
                  </tr>
                  <tr>
                    <td>Operator id</td>
                    <td className="mono">{catalog.operatorId}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {catalog.products.length > 0 && (
              <div className="table-card" style={{ border: "none" }}>
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Machine name</th>
                      <th>Picture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.products.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name || <span className="muted">unnamed</span>}</td>
                        <td className="muted">{p.dexName || "—"}</td>
                        <td>
                          {p.hasPicture ? (
                            <span className="badge-ok">Yes</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="panel">
          <div className="panel-h">Planogram write canary</div>
          <WriteCanary
            connected={Boolean(conn)}
            machineId={ctx.machineId ?? ""}
            alreadyVerified={canaryVerified}
            readiness={writeState?.readiness ?? null}
            rowTargets={writeState?.rowTargets ?? []}
          />
        </div>
      </div>
    </section>
  );
}
