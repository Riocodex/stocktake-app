"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import {
  updateFoodCostThresholdsAction,
  type ThresholdFormState,
} from "./cost-alert-actions";

const INITIAL: ThresholdFormState = {};

export function FoodCostThresholdForm({
  warningPercent,
  criticalPercent,
  canEdit,
}: {
  warningPercent: number;
  criticalPercent: number;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateFoodCostThresholdsAction,
    INITIAL,
  );

  if (!canEdit) {
    return (
      <p className="text-sm text-ink-muted">
        Warning at {warningPercent}% · Critical at {criticalPercent}%. Only
        super admins can change these.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error ? (
        <p className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="w-full rounded-xl bg-white px-3 py-2 text-sm text-ink ring-1 ring-ink/10">
          {state.success}
        </p>
      ) : null}
      <div>
        <label
          htmlFor="warningPercent"
          className="eyebrow mb-1 block text-ink-muted"
        >
          Warning %
        </label>
        <input
          id="warningPercent"
          name="warningPercent"
          type="number"
          min="0"
          max="100"
          step="0.1"
          required
          defaultValue={String(warningPercent)}
          className="w-28 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
        />
      </div>
      <div>
        <label
          htmlFor="criticalPercent"
          className="eyebrow mb-1 block text-ink-muted"
        >
          Critical %
        </label>
        <input
          id="criticalPercent"
          name="criticalPercent"
          type="number"
          min="0"
          max="100"
          step="0.1"
          required
          defaultValue={String(criticalPercent)}
          className="w-28 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save thresholds"}
      </Button>
    </form>
  );
}
