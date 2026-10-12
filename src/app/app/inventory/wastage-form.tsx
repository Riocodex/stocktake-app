"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  recordWastageAction,
  type WastageActionResult,
} from "@/lib/actions/wastage";
import {
  WASTAGE_REASON_LABELS,
  type WastageReason,
} from "@/lib/constants";
import { Button } from "@/components/ui";

const INITIAL: WastageActionResult = { error: null };

type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  category: string;
  quantity: number;
  unitPrice: number;
};

export function WastageForm({
  outlets,
  items: initialItems,
  fixedOutletId,
  fixedOutletName,
  recordPath,
}: {
  outlets: { id: string; name: string }[];
  items: CatalogItem[];
  fixedOutletId: string | null;
  fixedOutletName: string | null;
  /** Path used to reload stock when the outlet changes, e.g. /app/inventory/wastage?record=1 */
  recordPath: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    recordWastageAction,
    INITIAL,
  );
  const [items, setItems] = useState(initialItems);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  // Keep local quantities in sync when the server re-renders after wastage.
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!state.error && state.remainingQuantity !== undefined && state.itemId) {
      setItems((current) =>
        current.map((item) =>
          item.id === state.itemId
            ? { ...item, quantity: state.remainingQuantity ?? item.quantity }
            : item,
        ),
      );
      setQuantity("");
      router.refresh();
    }
  }, [state, router]);

  const selected = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [items, itemId],
  );

  const qty = Number(quantity);
  const estimatedValue =
    selected && Number.isFinite(qty) && qty > 0
      ? Math.round(qty * selected.unitPrice * 100) / 100
      : null;

  const availableItems = items.filter((item) => item.quantity > 0);
  const grouped = availableItems.reduce<Record<string, CatalogItem[]>>(
    (accumulator, item) => {
      (accumulator[item.category] ??= []).push(item);
      return accumulator;
    },
    {},
  );

  function onOutletChange(nextOutletId: string) {
    if (!nextOutletId) return;
    const url = new URL(recordPath, window.location.origin);
    url.searchParams.set("outlet", nextOutletId);
    url.searchParams.set("record", "1");
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function validateBeforeSubmit(formData: FormData) {
    setClientError(null);
    const chosenId = String(formData.get("itemId") ?? "");
    const chosenQty = Number(formData.get("quantity") ?? 0);
    const chosen = items.find((item) => item.id === chosenId);
    if (!chosen) {
      setClientError("Choose which product was wasted.");
      return false;
    }
    if (!Number.isFinite(chosenQty) || chosenQty <= 0) {
      setClientError("Quantity must be greater than zero.");
      return false;
    }
    if (chosen.quantity <= 0) {
      setClientError(
        `Cannot record wastage. Current stock is 0 ${chosen.unit}.`,
      );
      return false;
    }
    if (chosenQty > chosen.quantity) {
      setClientError(
        `Cannot record ${chosenQty} ${chosen.unit} of wastage. Current stock is ${chosen.quantity} ${chosen.unit}.`,
      );
      return false;
    }
    return true;
  }

  // Super admin must pick an outlet before we can show truthful on-hand figures.
  if (!fixedOutletId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Choose an outlet first. On-hand quantities are always for one venue —
          never a group total.
        </p>
        <div>
          <label htmlFor="outletId" className="eyebrow mb-2 block text-ink-muted">
            Outlet
          </label>
          <select
            id="outletId"
            defaultValue=""
            onChange={(event) => onOutletChange(event.target.value)}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="" disabled>
              Choose an outlet…
            </option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        if (!validateBeforeSubmit(formData)) return;
        formAction(formData);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="outletId" value={fixedOutletId} />
      <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
        <p className="eyebrow text-sage-800">Recording at</p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {fixedOutletName ?? "Selected outlet"}
        </p>
        {outlets.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              const url = new URL(recordPath, window.location.origin);
              url.searchParams.delete("outlet");
              url.searchParams.set("record", "1");
              router.push(`${url.pathname}?${url.searchParams.toString()}`);
            }}
            className="mt-2 text-xs font-semibold text-clay hover:underline"
          >
            Change outlet
          </button>
        ) : null}
      </div>

      <div>
        <label htmlFor="itemId" className="eyebrow mb-2 block text-ink-muted">
          Product
        </label>
        <select
          id="itemId"
          name="itemId"
          required
          value={itemId}
          onChange={(event) => {
            setItemId(event.target.value);
            setClientError(null);
          }}
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
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
        {availableItems.length === 0 ? (
          <p className="mt-2 text-xs text-ink-muted">
            No products currently have stock at this outlet.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="quantity" className="eyebrow mb-2 block text-ink-muted">
            Quantity{selected ? ` (${selected.unit})` : ""}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0.01"
            step="any"
            max={selected?.quantity || undefined}
            required
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setClientError(null);
            }}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
          {selected ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              Current stock: {selected.quantity} {selected.unit}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="reason" className="eyebrow mb-2 block text-ink-muted">
            Reason
          </label>
          <select
            id="reason"
            name="reason"
            required
            defaultValue=""
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="" disabled>
              Choose…
            </option>
            {(Object.keys(WASTAGE_REASON_LABELS) as WastageReason[]).map(
              (reason) => (
                <option key={reason} value={reason}>
                  {WASTAGE_REASON_LABELS[reason]}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="note" className="eyebrow mb-2 block text-ink-muted">
          Note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          placeholder="e.g. fridge failure overnight"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
      </div>

      {estimatedValue !== null ? (
        <p className="rounded-2xl border border-ink/8 bg-cream/50 px-4 py-3 text-sm text-ink-soft">
          Estimated value:{" "}
          <span className="font-semibold text-ink">
            €{estimatedValue.toFixed(2)}
          </span>
          {selected ? (
            <span className="text-ink-muted">
              {" "}
              · €{selected.unitPrice.toFixed(2)} / {selected.unit}
            </span>
          ) : null}
        </p>
      ) : null}

      {clientError || state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {clientError || state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3 text-sm text-sage-800">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || availableItems.length === 0}
      >
        {pending ? "Recording…" : "Record wastage"}
      </Button>
    </form>
  );
}
