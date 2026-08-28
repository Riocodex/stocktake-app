"use client";

import { useActionState } from "react";

import {
  receiveProductAction,
  type InventoryActionResult,
} from "@/lib/actions/inventory";
import { Button } from "@/components/ui";

const INITIAL: InventoryActionResult = { error: null };

export function ReceiveForm({
  itemId,
  outletId,
  unit,
}: {
  itemId: string;
  outletId: string;
  unit: string;
}) {
  const [state, formAction, pending] = useActionState(
    receiveProductAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="outletId" value={outletId} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="receive-qty"
            className="mb-1.5 block text-[11px] font-semibold text-ink-soft"
          >
            Qty received ({unit})
          </label>
          <input
            id="receive-qty"
            name="quantity"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="w-28 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay"
          />
        </div>
        <div>
          <label
            htmlFor="receive-expiry"
            className="mb-1.5 block text-[11px] font-semibold text-ink-soft"
          >
            Expiry
          </label>
          <input
            id="receive-expiry"
            name="expiryDate"
            type="date"
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add to stock"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-xs font-semibold text-red-600">{state.error}</p>
      ) : state.message ? (
        <p className="text-xs font-semibold text-emerald-700">{state.message}</p>
      ) : null}
    </form>
  );
}
