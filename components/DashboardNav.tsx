"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/sales", label: "Sales" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/tax", label: "Tax" },
  { href: "/dashboard/chat", label: "Chat" },
  { href: "/dashboard/mcp", label: "MCP" },
];

export default function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="dash-nav">
      {ITEMS.map((it) => {
        const active =
          it.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : undefined}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
