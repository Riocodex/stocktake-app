"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui";
import { logoutAction } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/auth";
import { ROLE_LABELS, ROLES } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  superOnly?: boolean;
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const NAV: NavItem[] = [
  {
    href: "/app",
    label: "Overview",
    icon: <Icon path="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-4H4v4Zm10-11h6V4h-6v5Z" />,
  },
  {
    href: "/app/products",
    label: "Products & Dishes",
    icon: <Icon path="M4 6h16M4 12h10M4 18h14M18 10v8M15 14h6" />,
  },
  {
    href: "/app/stock-takes",
    label: "Stock takes",
    icon: <Icon path="M9 5h6M9 5a2 2 0 0 0-2 2v0H5v14h14V7h-2a2 2 0 0 0-2-2M9 12h6M9 16h4" />,
  },
  {
    href: "/app/inventory",
    label: "Inventory",
    icon: <Icon path="M3 7l9-4 9 4-9 4-9-4Zm0 5l9 4 9-4M3 17l9 4 9-4" />,
  },
  {
    href: "/app/inventory/wastage",
    label: "Wastage",
    icon: <Icon path="M12 9v4M12 17h.01M10.3 3.3l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0Z" />,
  },
  {
    href: "/app/inventory/transfers",
    label: "Transfers",
    icon: <Icon path="M7 17l-5-5 5-5M17 7l5 5-5 5M3 12h18" />,
  },
  {
    href: "/app/inventory/history",
    label: "History",
    icon: <Icon path="M12 8v5l3 2M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" />,
  },
  {
    href: "/app/outlets",
    label: "Outlets",
    icon: <Icon path="M4 10v10h16V10M2 10l3-6h14l3 6H2Zm8 10v-6h4v6" />,
    superOnly: true,
  },
  {
    href: "/app/team",
    label: "Team",
    icon: <Icon path="M16 20v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 9v-1a4 4 0 0 0-3-3.9M18 11a2.5 2.5 0 0 0 0-5" />,
    superOnly: true,
  },
];

export function AppNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const items = NAV.filter((item) => !item.superOnly || isSuper);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  const navBody = (
    <>
      <div className="px-3">
        <Link href="/app" className="block w-28">
          <Image
            src="/brand/tribe-wordmark.png"
            alt="TRiBE"
            width={1800}
            height={291}
            className="h-auto w-full"
            priority
          />
        </Link>
        <p className="eyebrow mt-3 text-ink-muted">Stock Take</p>
      </div>

      <nav className="mt-8 flex-1 space-y-1">
        {items.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : item.href === "/app/inventory"
                ? pathname.startsWith("/app/inventory") &&
                  !pathname.startsWith("/app/inventory/wastage") &&
                  !pathname.startsWith("/app/inventory/transfers") &&
                  !pathname.startsWith("/app/inventory/history")
                : item.href === "/app/products"
                  ? pathname.startsWith("/app/products")
                  : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-clay text-white shadow-sm shadow-clay-800/15"
                  : "text-ink-soft hover:bg-ink/5 hover:text-ink",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-ink/8 pt-4">
        <div className="flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sage text-xs font-bold text-ink">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {user.name}
            </p>
            <p className="truncate text-[11px] text-ink-muted">
              {isSuper
                ? ROLE_LABELS[user.role]
                : (user.outletName ?? ROLE_LABELS[user.role])}
            </p>
          </div>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-2xl px-3 py-2 text-left text-sm font-semibold text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-ink/8 bg-cream/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/app" className="w-24">
          <Image
            src="/brand/tribe-wordmark.png"
            alt="TRiBE"
            width={1800}
            height={291}
            className="h-auto w-full"
          />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation"
          className="rounded-xl border border-ink/15 p-2 text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            {mobileOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 top-[57px] z-30 flex flex-col overflow-y-auto bg-cream px-4 py-6 lg:hidden">
          {navBody}
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink/8 bg-cream-deep/40 px-4 py-6 lg:flex">
        {navBody}
      </aside>
    </>
  );
}
