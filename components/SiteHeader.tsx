"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const { data: session, status } = useSession();
  const authed = status === "authenticated";
  const cur = (p: string): "page" | undefined => (pathname === p ? "page" : undefined);

  return (
    <header className="site-header">
      <nav className="nav">
        <Link className="nav-logo" href="/" aria-label="Slovend home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/slovend-wordmark.png" alt="Slovend" />
        </Link>

        <div
          className={`nav-links${open ? " open" : ""}`}
          id="navLinks"
          onClick={() => setOpen(false)}
        >
          <Link href="/locations" aria-current={cur("/locations")}>
            Locations
          </Link>
          <Link href="/slovend-intelligence" aria-current={cur("/slovend-intelligence")}>
            Slovend Intelligence
          </Link>
          <Link href="/about" aria-current={cur("/about")}>
            About
          </Link>
          {authed ? (
            <Link className="mobile-only" href="/dashboard">
              Dashboard
            </Link>
          ) : (
            <Link className="mobile-only" href="/login">
              Sign in
            </Link>
          )}
        </div>

        <div className="nav-cta">
          <div className="nav-auth">
            {authed ? (
              <div className="nav-account">
                <button
                  className="who"
                  onClick={() => setMenu((m) => !m)}
                  aria-haspopup="true"
                  aria-expanded={menu}
                >
                  {session?.user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar" src={session.user.image} alt="" />
                  ) : null}
                  {session?.user?.name?.split(" ")[0] ?? "Account"} ▾
                </button>
                {menu ? (
                  <div className="menu" onMouseLeave={() => setMenu(false)}>
                    <div className="email">{session?.user?.email}</div>
                    <Link href="/dashboard" onClick={() => setMenu(false)}>
                      Dashboard
                    </Link>
                    <Link href="/settings" onClick={() => setMenu(false)}>
                      Settings
                    </Link>
                    <button onClick={() => signOut({ callbackUrl: "/" })}>
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link className="btn-mini" href="/login">
                Sign in
              </Link>
            )}
          </div>
          <button
            className="nav-toggle"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span />
          </button>
        </div>
      </nav>
    </header>
  );
}
