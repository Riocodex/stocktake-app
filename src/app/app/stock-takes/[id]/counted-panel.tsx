"use client";

import { formatMoney, formatQty } from "@/lib/format";
import type { ChecklistItem } from "./category-checklist";

export function CountedPanel({
  items,
}: {
  items: (ChecklistItem & { category: string; categoryId: string })[];
}) {
  if (items.length === 0) {
    return (
      <p className="px-1 text-sm text-ink-muted">
        Counted products will collect here as you work through each section.
      </p>
    );
  }

  const total = items.reduce(
    (sum, item) => sum + (item.countedQty ?? 0) * item.unitPrice,
    0,
  );

  return (
    <div className="overflow-hidden rounded-3xl border border-ink/8 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
        <p className="eyebrow text-ink-muted">Counted this session</p>
        <p className="text-sm font-semibold text-ink">{formatMoney(total)}</p>
      </div>
      <ul className="max-h-[28rem] divide-y divide-ink/6 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("tribe:focus-count-item", {
                    detail: { categoryId: item.categoryId, itemId: item.id },
                  }),
                );
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-cream/70"
            >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="h-3 w-3"
                aria-hidden="true"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
              <p className="truncate text-[11px] text-ink-muted">
                {item.category} · {formatQty(item.countedQty ?? 0)} {item.unit}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-ink">
              {formatMoney((item.countedQty ?? 0) * item.unitPrice)}
            </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
