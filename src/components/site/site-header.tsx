"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui";
import { NAV_LINKS } from "@/lib/site-content";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-5">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex max-w-6xl items-center gap-3 rounded-pill bg-white/95 px-3 py-2.5 backdrop-blur transition-shadow sm:px-5",
          scrolled
            ? "shadow-[0_10px_30px_-12px_rgb(96_54_46/0.35)]"
            : "shadow-[0_6px_20px_-14px_rgb(96_54_46/0.3)]",
        )}
      >
        <Link href="/" aria-label="TRiBE home" className="shrink-0">
          <Image
            src="/brand/tribe-wordmark.png"
            alt="TRiBE"
            width={1800}
            height={291}
            priority
            className="h-6 w-auto sm:h-7"
          />
        </Link>

        <nav className="mx-auto hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-pill px-3.5 py-1.5 text-sm font-bold transition-colors",
                  active
                    ? "bg-sage-100 text-teal"
                    : "text-teal/80 hover:bg-sage-50 hover:text-teal",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <Link
            href="/locations"
            aria-label="Book a table"
            title="Book a table"
            className="grid h-9 w-9 place-items-center rounded-xl bg-sage text-white transition-colors hover:bg-sage-600"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2.5" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </Link>

          <Link
            href="/login"
            aria-label="Staff stock take sign in"
            title="Staff stock take"
            className="grid h-9 w-9 place-items-center rounded-xl border-2 border-teal/15 text-teal transition-colors hover:border-teal hover:bg-teal hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
          </Link>

          <Link
            href="/shop"
            className="hidden rounded-pill border-2 border-clay px-4 py-1.5 text-sm font-bold text-clay transition-colors hover:bg-clay hover:text-white sm:block"
          >
            Shop
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="grid h-9 w-9 place-items-center rounded-xl border-2 border-teal/15 text-teal lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="pointer-events-auto mx-auto mt-2 max-w-6xl rounded-3xl bg-white p-3 shadow-[0_20px_40px_-20px_rgb(96_54_46/0.4)] lg:hidden">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "block rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors",
                  active ? "bg-sage-100 text-teal" : "text-teal/80 hover:bg-sage-50",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
