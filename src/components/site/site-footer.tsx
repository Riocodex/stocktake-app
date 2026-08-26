import Link from "next/link";

import { HamsaMark } from "@/components/brand/marks";
import { CONTACT, LOCATIONS } from "@/lib/site-content";

const CONTACT_CARDS = [
  {
    label: "Call us",
    value: CONTACT.phone,
    href: CONTACT.phoneHref,
    icon: (
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    ),
  },
  {
    label: "Write to us",
    value: CONTACT.email,
    href: `mailto:${CONTACT.email}`,
    icon: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2.5" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
  },
  {
    label: "Our Locations",
    value: `${LOCATIONS.length} locations`,
    href: "/locations",
    icon: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
];

const COLUMNS = [
  {
    title: "Main",
    links: [
      { href: "/", label: "Home" },
      { href: "/our-story", label: "Our story" },
      { href: "/locations", label: "Locations" },
      { href: "/events", label: "Events" },
    ],
  },
  {
    title: "Shop",
    links: [{ href: "/shop", label: "Shop" }],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/refunds", label: "Refund Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-cocoa text-white">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        {/* Contact cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {CONTACT_CARDS.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="group rounded-2xl bg-white px-6 py-7 text-center transition-transform hover:-translate-y-1"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto h-6 w-6 text-teal"
                aria-hidden="true"
              >
                {card.icon}
              </svg>
              <p className="display-heading mt-3 text-lg text-teal">
                {card.label}
              </p>
              <p className="mt-1 text-sm font-bold text-clay">{card.value}</p>
            </Link>
          ))}
        </div>

        {/* Locations */}
        <h2 className="display-heading mt-12 mb-4 text-xl text-sage">Find us</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LOCATIONS.map((location) => (
            <div
              key={location.slug}
              className="rounded-2xl bg-cocoa-light p-4"
            >
              <p className="display-heading text-base text-sage">
                {location.name}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/85">
                {location.address}
              </p>
              <p className="mt-2 text-xs font-bold text-white/70">
                {CONTACT.phone}
              </p>
              <p className="mt-1 text-xs text-white/60">{location.hours}</p>
              <Link
                href="/menu"
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-clay-200 hover:text-white"
              >
                View Menu
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </Link>
            </div>
          ))}
        </div>

        {/* Brand + columns */}
        <div className="mt-12 grid gap-10 border-t border-white/10 pt-10 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <HamsaMark className="w-16 text-white" strokeWidth={6} />
            <p className="mt-5 max-w-sm text-sm leading-relaxed font-bold text-white/85">
              All-day breakfast, brunch, lunch and cocktails across Malta. Real
              food for every lifestyle including vegan, veggie and dairy-free
              options. Good vibes included.
            </p>
            <Link
              href="/menu"
              className="mt-5 inline-block rounded-pill bg-clay px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-clay-600"
            >
              View Menus
            </Link>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="display-heading border-b border-white/15 pb-2 text-sm text-sage">
                  {column.title}
                </h3>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm font-bold text-white/80 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} TRiBE Malta. All rights reserved.
          </p>
          <Link
            href="/login"
            className="text-xs font-bold text-sage transition-colors hover:text-white"
          >
            Staff stock take →
          </Link>
        </div>
      </div>
    </footer>
  );
}
