"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { createTransfersByDestination } from "./create-multi";
import { TransferPhotoPanel } from "./transfer-photo";

type Line = {
  key: string;
  itemId: string;
  quantity: string;
  toOutletId: string;
};

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
  const router = useRouter();
  const [fromOutletId, setFromOutletId] = useState(fixedFromOutletId ?? "");
  const [defaultToOutletId, setDefaultToOutletId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: "1", itemId: "", quantity: "", toOutletId: "" },
  ]);
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [loadingItems, setLoadingItems] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function saveManual() {
    setError(null);
    if (!effectiveFrom) {
      setError("Choose which outlet is sending stock.");
      return;
    }

    const payload = lines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        toOutletId: line.toOutletId || defaultToOutletId,
      }));

    if (payload.some((line) => !line.toOutletId)) {
      setError("Choose a destination for every product line.");
      return;
    }

    setPending(true);
    try {
      const result = await createTransfersByDestination({
        fromOutletId: effectiveFrom,
        note,
        lines: payload,
      });
      if (result.error || result.transfers.length === 0) {
        setError(result.error ?? "Could not create transfer drafts.");
        return;
      }
      if (result.transfers.length === 1) {
        router.push(`/app/inventory/transfers/${result.transfers[0].id}`);
      } else {
        router.push("/app/inventory/transfers");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create transfers.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {fixedFromOutletId ? (
        <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
          <p className="eyebrow text-sage-800">Sending from</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {fixedFromOutletName}
          </p>
        </div>
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
            value={fromOutletId}
            onChange={(event) => {
              setFromOutletId(event.target.value);
              setDefaultToOutletId("");
              setLines([
                { key: "1", itemId: "", quantity: "", toOutletId: "" },
              ]);
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
          htmlFor="defaultToOutletId"
          className="eyebrow mb-2 block text-ink-muted"
        >
          Default destination (optional)
        </label>
        <select
          id="defaultToOutletId"
          value={defaultToOutletId}
          onChange={(event) => {
            const next = event.target.value;
            setDefaultToOutletId(next);
            setLines((current) =>
              current.map((line) =>
                line.toOutletId ? line : { ...line, toOutletId: next },
              ),
            );
          }}
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
        >
          <option value="">Set per product…</option>
          {destinations.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          You can still send different products to different outlets below.
        </p>
      </div>

      {effectiveFrom ? (
        <TransferPhotoPanel
          fromOutletId={effectiveFrom}
          destinations={destinations}
          defaultToOutletId={defaultToOutletId}
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
              className="grid gap-3 rounded-2xl border border-ink/8 bg-cream/40 p-4 sm:grid-cols-[1fr_7rem_1fr_auto]"
            >
              <div>
                {index === 0 ? (
                  <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                    Product
                  </label>
                ) : null}
                <select
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
              <div>
                {index === 0 ? (
                  <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                    Send to
                  </label>
                ) : null}
                <select
                  value={line.toOutletId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry) =>
                        entry.key === line.key
                          ? { ...entry, toOutletId: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
                >
                  <option value="">Choose…</option>
                  {destinations.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                    </option>
                  ))}
                </select>
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
              {
                key: String(Date.now()),
                itemId: "",
                quantity: "",
                toOutletId: defaultToOutletId,
              },
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
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
          placeholder="e.g. Balluta soft drinks, Valletta dry goods"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        onClick={() => void saveManual()}
        disabled={
          pending ||
          !effectiveFrom ||
          !lines.some((line) => line.itemId && Number(line.quantity) > 0)
        }
      >
        {pending ? "Creating…" : "Save manual draft(s)"}
      </Button>
    </div>
  );
}
