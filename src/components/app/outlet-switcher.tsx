"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Option = { id: string; name: string };

/**
 * Super-admin scope selector. Writes the choice to the `outlet` search param so
 * the surrounding server components can re-query with the new scope.
 */
export function OutletSwitcher({
  outlets,
  value,
  allLabel = "All outlets",
}: {
  outlets: Option[];
  value: string | null;
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("outlet");
    } else {
      params.set("outlet", next);
    }
    // Reset pagination-ish params so the new scope starts from the top.
    params.delete("page");

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <label className="relative inline-flex items-center gap-2">
      <span className="sr-only">Filter by outlet</span>
      <select
        value={value ?? "all"}
        onChange={(event) => handleChange(event.target.value)}
        disabled={pending}
        className="appearance-none rounded-pill border border-ink/15 bg-white py-2 pr-9 pl-4 text-sm font-semibold text-ink outline-none transition hover:border-clay focus:border-clay disabled:opacity-60"
      >
        <option value="all">{allLabel}</option>
        {outlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute right-3.5 h-3.5 w-3.5 text-ink-muted"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}
