"use client";

import { useActionState } from "react";

import {
  updateReferencePriceAction,
  type InventoryActionResult,
} from "@/lib/actions/inventory";
import { Button } from "@/components/ui";

const INITIAL: InventoryActionResult = { error: null };

export function ReferencePriceForm({
  itemId,
  currentPrice,
  unit,
}: {
  itemId: string;
  currentPrice: number;
  unit: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateReferencePriceAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <p className="eyebrow text-ink-muted">Group purchase price</p>
      <p className="text-xs text-ink-muted">
        Shared across all outlets. Used for dish costing. Does not change
        outlet stock quantities.
      </p>
      {state.error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="rounded-xl bg-white px-3 py-2 text-sm text-ink ring-1 ring-ink/10">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="price" className="eyebrow mb-1 block text-ink-muted">
            € / {unit}
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={currentPrice.toFixed(2)}
            className="w-36 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Update price"}
        </Button>
      </div>
    </form>
  );
}
