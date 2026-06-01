"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/settings", label: "Account" },
  { href: "/settings/api", label: "API" },
  { href: "/settings/mcp", label: "MCP" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="dash-nav">
      {ITEMS.map((it) => {
        const active =
          it.href === "/settings" ? pathname === "/settings" : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : undefined}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
