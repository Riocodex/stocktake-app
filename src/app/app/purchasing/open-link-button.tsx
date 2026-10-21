"use client";

import { useActionState, useEffect } from "react";

import {
  openOrderingLinkAction,
  type PurchasingActionResult,
} from "./actions";
import { Button } from "@/components/ui";

const INITIAL: PurchasingActionResult = { error: null };

export function OpenOrderingLinkButton({
  cardId,
  outletId,
  methodLabel,
  disabled,
  blockedReason,
}: {
  cardId: string;
  outletId: string | null;
  methodLabel: string;
  disabled?: boolean;
  blockedReason?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    openOrderingLinkAction,
    INITIAL,
  );

  useEffect(() => {
    if (state.url) {
      window.open(state.url, "_blank", "noopener,noreferrer");
    }
  }, [state.url]);

  if (disabled) {
    return (
      <div className="space-y-1">
        <Button type="button" size="lg" disabled className="w-full sm:w-auto">
          Open {methodLabel}
        </Button>
        {blockedReason ? (
          <p className="text-xs text-ink-muted">{blockedReason}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="cardId" value={cardId} />
      {outletId ? (
        <input type="hidden" name="outletId" value={outletId} />
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Opening…" : `Open ${methodLabel}`}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      ) : state.message && state.url ? (
        <p className="text-xs text-ink-muted">{state.message}</p>
      ) : null}
    </form>
  );
}
