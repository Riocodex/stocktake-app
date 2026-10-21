"use client";

import { useActionState } from "react";

import {
  requestApprovalAction,
  type PurchasingActionResult,
} from "./actions";
import { Button } from "@/components/ui";

const INITIAL: PurchasingActionResult = { error: null };

export function RequestApprovalForm({
  cardId,
  outletId,
}: {
  cardId: string;
  outletId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    requestApprovalAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-2xl border border-ink/10 bg-cream/50 p-4">
      <input type="hidden" name="cardId" value={cardId} />
      {outletId ? (
        <input type="hidden" name="outletId" value={outletId} />
      ) : null}
      <p className="text-xs text-ink-muted">
        Approval lets you open the ordering link. It does not send a message to
        the supplier or confirm they received an order.
      </p>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          Notes (optional)
        </label>
        <textarea
          name="note"
          rows={2}
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          placeholder="Why you need to order…"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          Expected items / quantities (optional)
        </label>
        <textarea
          name="expectedItems"
          rows={2}
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          placeholder="e.g. 2 crates tomatoes, 1 case milk"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="text-xs text-emerald-800">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Request office approval"}
      </Button>
    </form>
  );
}
