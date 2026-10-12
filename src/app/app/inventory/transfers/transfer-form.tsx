"use client";

import { useActionState, useState } from "react";

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
  items,
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
  const [lines, setLines] = useState<Line[]>([
    { key: "1", itemId: "", quantity: "" },
  ]);
  const [imageUrl, setImageUrl] = useState("");

  const effectiveFrom = fixedFromOutletId || fromOutletId;

  const grouped = items.reduce<Record<string, CatalogItem[]>>(
    (accumulator, item) => {
      (accumulator[item.category] ??= []).push(item);
      return accumulator;
    },
    {},
  );

  const destinations = outlets.filter((outlet) => outlet.id !== effectiveFrom);

  return (
    <form action={formAction} className="space-y-5">
      {imageUrl ? <input type="hidden" name="imageUrl" value={imageUrl} /> : null}

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
            onChange={(event) => setFromOutletId(event.target.value)}
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
          defaultValue=""
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
          simulated={simulatedAi}
          onApply={(photoLines, photoUrl) => {
            setLines(
              photoLines.map((line, index) => ({
                key: `photo-${index}-${line.itemId}`,
                itemId: line.itemId,
                quantity: line.quantity,
              })),
            );
            setImageUrl(photoUrl ?? "");
          }}
        />
      ) : null}

      <div className="space-y-3">
        <p className="eyebrow text-ink-muted">Products to send</p>
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
                  required
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
                  required
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

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating…" : "Save draft transfer"}
      </Button>
    </form>
  );
}
