"use client";

import { useActionState } from "react";

import {
  reviewApprovalAction,
  type PurchasingActionResult,
} from "../actions";
import { Button } from "@/components/ui";

const INITIAL: PurchasingActionResult = { error: null };

export function ReviewApprovalForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    reviewApprovalAction,
    INITIAL,
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value="APPROVED" />
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Decision note
          </label>
          <input
            type="text"
            name="decisionNote"
            placeholder="Optional"
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Approve
        </Button>
      </form>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value="REJECTED" />
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Rejection reason
          </label>
          <input
            type="text"
            name="decisionNote"
            placeholder="Optional"
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Reject
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="text-xs text-emerald-800">{state.message}</p>
      ) : null}
    </div>
  );
}
