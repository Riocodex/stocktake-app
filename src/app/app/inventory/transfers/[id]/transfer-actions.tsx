"use client";

import { useActionState, useState } from "react";

import {
  cancelTransferAction,
  receiveTransferAction,
  sendTransferAction,
  type TransferActionResult,
} from "@/lib/actions/transfers";
import { Button } from "@/components/ui";

const INITIAL: TransferActionResult = { error: null };

type Line = {
  itemId: string;
  name: string;
  unit: string;
  sentQty: number;
};

export function TransferDraftActions({ transferId }: { transferId: string }) {
  const [sendState, sendAction, sendPending] = useActionState(
    sendTransferAction,
    INITIAL,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelTransferAction,
    INITIAL,
  );

  return (
    <div className="space-y-3">
      {sendState.error || cancelState.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {sendState.error || cancelState.error}
        </p>
      ) : null}
      {sendState.message || cancelState.message ? (
        <p className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3 text-sm text-sage-800">
          {sendState.message || cancelState.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <form action={sendAction}>
          <input type="hidden" name="transferId" value={transferId} />
          <Button type="submit" disabled={sendPending || cancelPending}>
            {sendPending ? "Sending…" : "Send transfer"}
          </Button>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="transferId" value={transferId} />
          <Button
            type="submit"
            variant="secondary"
            disabled={sendPending || cancelPending}
          >
            {cancelPending ? "Cancelling…" : "Cancel draft"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function TransferReceiveForm({
  transferId,
  lines,
}: {
  transferId: string;
  lines: Line[];
}) {
  const [state, formAction, pending] = useActionState(
    receiveTransferAction,
    INITIAL,
  );
  const [received, setReceived] = useState(
    Object.fromEntries(lines.map((line) => [line.itemId, String(line.sentQty)])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="transferId" value={transferId} />
      <p className="text-sm text-ink-muted">
        Confirm what actually arrived. If a quantity differs from what was sent,
        add a discrepancy note.
      </p>
      {lines.map((line) => {
        const qty = Number(received[line.itemId] ?? line.sentQty);
        const differs =
          Number.isFinite(qty) && Math.round(qty * 100) !== Math.round(line.sentQty * 100);
        return (
          <div
            key={line.itemId}
            className="rounded-2xl border border-ink/8 bg-cream/40 p-4"
          >
            <input type="hidden" name="itemId" value={line.itemId} />
            <p className="font-semibold text-ink">{line.name}</p>
            <p className="text-xs text-ink-muted">
              Sent {line.sentQty} {line.unit}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="eyebrow mb-1.5 block text-ink-muted">
                  Received ({line.unit})
                </label>
                <input
                  name="receivedQty"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={received[line.itemId] ?? ""}
                  onChange={(event) =>
                    setReceived((current) => ({
                      ...current,
                      [line.itemId]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
                />
              </div>
              <div>
                <label className="eyebrow mb-1.5 block text-ink-muted">
                  Discrepancy note{differs ? " (required)" : ""}
                </label>
                <input
                  name="discrepancyNote"
                  value={notes[line.itemId] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [line.itemId]: event.target.value,
                    }))
                  }
                  required={differs}
                  placeholder={differs ? "Why does this differ?" : "Optional"}
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
                />
              </div>
            </div>
          </div>
        );
      })}

      <div>
        <label htmlFor="note" className="eyebrow mb-2 block text-ink-muted">
          Receive note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
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
      {state.message ? (
        <p className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3 text-sm text-sage-800">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Receiving…" : "Confirm receipt"}
      </Button>
    </form>
  );
}
