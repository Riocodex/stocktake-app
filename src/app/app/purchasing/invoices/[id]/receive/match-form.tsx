"use client";

import { useActionState } from "react";

import {
  matchReceiveLineAction,
  type ReceiveActionResult,
} from "./actions";
import { Button } from "@/components/ui";

const INITIAL: ReceiveActionResult = { error: null };

export function MatchLineForm({
  invoiceId,
  invoiceLineId,
  description,
  items,
}: {
  invoiceId: string;
  invoiceLineId: string;
  description: string;
  items: { id: string; name: string; sku: string; unit: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    matchReceiveLineAction,
    INITIAL,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-ink/8 bg-cream/50 p-3"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="invoiceLineId" value={invoiceLineId} />
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-semibold text-ink">{description}</p>
        <select
          name="itemId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Match to item…
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.sku}) · {item.unit}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Match"}
      </Button>
      {state.error ? (
        <p className="w-full text-xs text-red-700">{state.error}</p>
      ) : state.message ? (
        <p className="w-full text-xs text-emerald-800">{state.message}</p>
      ) : null}
    </form>
  );
}
