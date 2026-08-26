"use client";

import { useActionState } from "react";

import { createStockTakeAction, type ActionResult } from "@/lib/actions/stock";
import { Button } from "@/components/ui";

const INITIAL: ActionResult = { error: null };

export function NewStockTakeForm({
  outlets,
  fixedOutletName,
}: {
  outlets: { id: string; name: string; city: string | null }[];
  fixedOutletName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    createStockTakeAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-6">
      {fixedOutletName ? (
        <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
          <p className="eyebrow text-sage-800">Counting for</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {fixedOutletName}
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="outletId" className="eyebrow mb-2 block text-ink-muted">
            Outlet
          </label>
          <select
            id="outletId"
            name="outletId"
            required
            defaultValue=""
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="" disabled>
              Choose an outlet…
            </option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
                {outlet.city ? ` — ${outlet.city}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="note" className="eyebrow mb-2 block text-ink-muted">
          Note <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="note"
          name="note"
          type="text"
          maxLength={140}
          placeholder="e.g. Monday back bar count"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-clay"
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
        {pending ? "Creating…" : "Create and start counting"}
      </Button>
    </form>
  );
}
