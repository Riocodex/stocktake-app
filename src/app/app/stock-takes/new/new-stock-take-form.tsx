"use client";

import { useActionState } from "react";

import { createStockTakeAction, type ActionResult } from "@/lib/actions/stock";
import { STOCK_AREAS } from "@/lib/constants";
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

      <fieldset>
        <legend className="eyebrow mb-3 block text-ink-muted">
          Which section are you counting?
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer flex-col gap-1 rounded-2xl border-2 border-ink/10 bg-white p-4 has-[:checked]:border-clay has-[:checked]:bg-clay-50">
            <input
              type="radio"
              name="area"
              value={STOCK_AREAS.BAR}
              required
              defaultChecked
              className="accent-[#ba8976]"
            />
            <span className="display-heading text-lg text-ink">Bar</span>
            <span className="text-xs text-ink-muted">
              Soft drinks, beer, wine, spirits, coffee, merch.
            </span>
          </label>
          <label className="flex cursor-pointer flex-col gap-1 rounded-2xl border-2 border-ink/10 bg-white p-4 has-[:checked]:border-clay has-[:checked]:bg-clay-50">
            <input
              type="radio"
              name="area"
              value={STOCK_AREAS.KITCHEN}
              className="accent-[#ba8976]"
            />
            <span className="display-heading text-lg text-ink">Kitchen</span>
            <span className="text-xs text-ink-muted">
              Dairy, bakery, fruit & veg, dry goods, packaging.
            </span>
          </label>
        </div>
      </fieldset>

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
