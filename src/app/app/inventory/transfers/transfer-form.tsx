"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  createTransferAction,
  type TransferActionResult,
} from "@/lib/actions/transfers";
import { Button } from "@/components/ui";
import { TransferPhotoPanel } from "./transfer-photo";

const INITIAL: TransferActionResult = { error: null };

type Line = { key: string; itemId: string; quantity: string };

type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  category: string;
  quantity: number;
};

export function TransferForm({
  outlets,
  items: initialItems,
  fixedFromOutletId,
  fixedFromOutletName,
  simulatedAi = false,
}: {
  outlets: { id: string; name: string }[];
  items: CatalogItem[];
  fixedFromOutletId: string | null;
  fixedFromOutletName: string | null;
  simulatedAi?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createTransferAction,
    INITIAL,
  );
  const [fromOutletId, setFromOutletId] = useState(fixedFromOutletId ?? "");
  const [toOutletId, setToOutletId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: "1", itemId: "", quantity: "" },
  ]);
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [loadingItems, setLoadingItems] = useState(false);

  const effectiveFrom = fixedFromOutletId || fromOutletId;

  useEffect(() => {
    setFromOutletId(fixedFromOutletId ?? "");
  }, [fixedFromOutletId]);

  useEffect(() => {
    if (!effectiveFrom) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoadingItems(true);
    fetch(`/api/mobile/inventory?outlet=${encodeURIComponent(effectiveFrom)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          items?: {
            id: string;
            name: string;
            brand: string | null;
            unit: string;
            category: string;
            quantity: number;
          }[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load stock.");
        }
        if (cancelled) return;
        setItems(
          (payload.items ?? [])
            .filter((item) => item.quantity > 0)
            .map((item) => ({
              id: item.id,
              name: item.brand ? `${item.brand} ${item.name}` : item.name,
              unit: item.unit,
              category: item.category,
              quantity: item.quantity,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveFrom]);

  const grouped = useMemo(
    () =>
      items.reduce<Record<string, CatalogItem[]>>((accumulator, item) => {
        (accumulator[item.category] ??= []).push(item);
        return accumulator;
      }, {}),
    [items],
  );

  const destinations = outlets.filter((outlet) => outlet.id !== effectiveFrom);

  return (
    <form action={formAction} className="space-y-5">
      {fixedFromOutletId ? (
        <>
          <input type="hidden" name="fromOutletId" value={fixedFromOutletId} />
          <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
            <p className="eyebrow text-sage-800">Sending from</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {fixedFromOutletName}
            </p>
          </div>
        </>
      ) : (
        <div>
          <label
            htmlFor="fromOutletId"
            className="eyebrow mb-2 block text-ink-muted"
          >
            From outlet
          </label>
          <select
            id="fromOutletId"
            name="fromOutletId"
            required
            value={fromOutletId}
            onChange={(event) => {
              setFromOutletId(event.target.value);
              setToOutletId("");
              setLines([{ key: "1", itemId: "", quantity: "" }]);
            }}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
          >
            <option value="" disabled>
              Choose…
            </option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label
          htmlFor="toOutletId"
          className="eyebrow mb-2 block text-ink-muted"
        >
          To outlet
        </label>
        <select
          id="toOutletId"
          name="toOutletId"
          required
          value={toOutletId}
          onChange={(event) => setToOutletId(event.target.value)}
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
        >
          <option value="" disabled>
            Choose…
          </option>
          {destinations.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
            </option>
          ))}
        </select>
      </div>

      {effectiveFrom ? (
        <TransferPhotoPanel
          fromOutletId={effectiveFrom}
          toOutletId={toOutletId}
          note={note}
          simulated={simulatedAi}
        />
      ) : null}

      <div className="space-y-3">
        <p className="eyebrow text-ink-muted">Or add products manually</p>
        {!effectiveFrom ? (
          <p className="text-sm text-ink-muted">
            Choose a source outlet to load products with stock.
          </p>
        ) : loadingItems ? (
          <p className="text-sm text-ink-muted">Loading products…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No products currently have stock at this outlet.
          </p>
        ) : null}

        {lines.map((line, index) => {
          const selected = items.find((item) => item.id === line.itemId);
          return (
            <div
              key={line.key}
              className="grid gap-3 rounded-2xl border border-ink/8 bg-cream/40 p-4 sm:grid-cols-[1fr_7rem_auto]"
            >
              <div>
                {index === 0 ? (
                  <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                    Product
                  </label>
                ) : null}
                <select
                  name="itemId"
                  value={line.itemId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry) =>
                        entry.key === line.key
                          ? { ...entry, itemId: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
                  disabled={!effectiveFrom || loadingItems}
                >
                  <option value="">Choose…</option>
                  {Object.entries(grouped).map(([category, categoryItems]) => (
                    <optgroup key={category} label={category}>
                      {categoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · on hand {item.quantity} {item.unit}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                {index === 0 ? (
                  <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                    Qty{selected ? ` (${selected.unit})` : ""}
                  </label>
                ) : null}
                <input
                  name="quantity"
                  type="number"
                  min="0.01"
                  step="any"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry) =>
                        entry.key === line.key
                          ? { ...entry, quantity: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.length === 1
                        ? current
                        : current.filter((entry) => entry.key !== line.key),
                    )
                  }
                  className="text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() =>
            setLines((current) => [
              ...current,
              { key: String(Date.now()), itemId: "", quantity: "" },
            ])
          }
          className="text-sm font-semibold text-clay hover:underline"
        >
          + Add product
        </button>
      </div>

      <div>
        <label htmlFor="note" className="eyebrow mb-2 block text-ink-muted">
          Note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
          placeholder="e.g. Balluta running low on soft drinks"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={
          pending ||
          !effectiveFrom ||
          !toOutletId ||
          !lines.some((line) => line.itemId && Number(line.quantity) > 0)
        }
      >
        {pending ? "Creating…" : "Save manual draft"}
      </Button>
    </form>
  );
}
