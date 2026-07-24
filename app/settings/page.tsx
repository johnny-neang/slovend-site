import type { Metadata } from "next";
import { auth } from "@/auth";
import { deleteAccount } from "./actions";

export const metadata: Metadata = { title: "Account · Slovend Intelligence" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const user = session?.user;
  const initial = (user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Slovend Intelligence · Settings</div>
            <h1 className="serif-display">Account</h1>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-h">Profile</div>
          <div className="account-row">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="account-avatar" src={user.image} alt="" />
            ) : (
              <div className="account-avatar account-avatar-blank">{initial}</div>
            )}
            <div className="account-id">
              <div className="account-name">{user?.name ?? "—"}</div>
              <div className="account-email">{user?.email}</div>
              <div className="account-prov">Signed in with Google</div>
            </div>
          </div>
          <p className="mcp-sub" style={{ marginTop: 16 }}>
            Your name, email and photo come from Google and can&apos;t be changed here — update them in
            your Google account.
          </p>
        </div>

        <div className="panel danger-zone">
          <div className="panel-h danger-h">Danger zone</div>
          <p className="mcp-sub" style={{ marginBottom: 14 }}>
            Permanently delete your Slovend Intelligence data — your Nayax connection, all collected sales history,
            tax &amp; timezone settings, chat threads, and MCP activity. <strong>This cannot be
            undone.</strong> You can sign back in later to start fresh.
          </p>
          {sp.error === "confirm" && <p className="tax-hint">Please type DELETE to confirm.</p>}
          <form action={deleteAccount} className="danger-form">
            <input
              name="confirm"
              placeholder="Type DELETE to confirm"
              autoComplete="off"
              aria-label="Type DELETE to confirm"
            />
            <button type="submit" className="danger-btn">
              Delete my data
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
