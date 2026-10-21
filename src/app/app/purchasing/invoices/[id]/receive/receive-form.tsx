"use client";

import { useActionState, useMemo, useState } from "react";

import {
  linkDeliveryAction,
  markReceivedWithoutStockAction,
  receiveFromInvoiceAction,
  type ReceiveActionResult,
} from "./actions";
import { Button } from "@/components/ui";

const INITIAL: ReceiveActionResult = { error: null };

type Line = {
  invoiceLineId: string;
  rawDescription: string;
  itemId: string | null;
  itemName: string | null;
  stockUnit: string | null;
  invoiceQuantity: number | null;
  invoiceUnit: string | null;
  invoicedStockQty: number | null;
  quantityReceived: number;
  remainingStockQty: number | null;
  conversionError: string | null;
  excludeFromReceiving: boolean;
  canReceive: boolean;
  matchStatus: string;
};

type Suspected = {
  id: string;
  createdAt: string;
  userName: string;
  overlappingItems: number;
  risk: string;
  lines: { id: string; itemId: string; quantity: number; itemName: string }[];
};

export function ReceiveFromInvoiceForm({
  invoiceId,
  lines: initialLines,
  suspected,
  invoiceLinesForMap,
}: {
  invoiceId: string;
  lines: Line[];
  suspected: Suspected[];
  invoiceLinesForMap: { id: string; label: string; itemId: string | null }[];
}) {
  const [receiveState, receiveAction, receivePending] = useActionState(
    receiveFromInvoiceAction,
    INITIAL,
  );
  const [linkState, linkAction, linkPending] = useActionState(
    linkDeliveryAction,
    INITIAL,
  );
  const [markState, markAction, markPending] = useActionState(
    markReceivedWithoutStockAction,
    INITIAL,
  );

  const [qty, setQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const line of initialLines) {
      init[line.invoiceLineId] =
        line.canReceive && line.remainingStockQty != null
          ? String(line.remainingStockQty)
          : "";
    }
    return init;
  });
  const [excluded, setExcluded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const line of initialLines) {
      init[line.invoiceLineId] = line.excludeFromReceiving;
    }
    return init;
  });
  const [ackSuspect, setAckSuspect] = useState(false);
  const [allowOver, setAllowOver] = useState(false);

  const diffs = useMemo(() => {
    return initialLines.map((line) => {
      const entered = Number(qty[line.invoiceLineId] || 0);
      const remaining = line.remainingStockQty ?? 0;
      const invoiced = line.invoicedStockQty;
      return {
        id: line.invoiceLineId,
        short: remaining - entered,
        vsInvoice:
          invoiced == null
            ? null
            : invoiced - (line.quantityReceived + entered),
      };
    });
  }, [initialLines, qty]);

  return (
    <div className="space-y-8">
      {suspected.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Possible duplicate manual deliveries</p>
          <p className="text-xs">
            These deliveries are not linked to this invoice but overlap items and
            dates. Link them below instead of receiving again — linking does not
            add stock.
          </p>
          {suspected.map((row) => (
            <div key={row.id} className="rounded-xl bg-white/70 p-3 text-xs">
              <p>
                {row.createdAt.slice(0, 10)} · {row.userName} ·{" "}
                {row.overlappingItems} overlapping item(s)
              </p>
              <p className="mt-1 text-amber-900">{row.risk}</p>
              <form action={linkAction} className="mt-3 space-y-2">
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <input type="hidden" name="deliveryId" value={row.id} />
                {row.lines.map((dLine) => (
                  <div key={dLine.id} className="flex flex-wrap items-center gap-2">
                    <input
                      type="hidden"
                      name="deliveryLineId"
                      value={dLine.id}
                    />
                    <span>
                      {dLine.itemName} · {dLine.quantity}
                    </span>
                    <select
                      name="mapInvoiceLineId"
                      defaultValue=""
                      className="rounded-lg border border-ink/15 px-2 py-1"
                    >
                      <option value="">Map to invoice line…</option>
                      {invoiceLinesForMap
                        .filter((l) => l.itemId === dLine.itemId)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
                <Button type="submit" size="sm" disabled={linkPending}>
                  Link without stock increase
                </Button>
              </form>
            </div>
          ))}
          {linkState.error ? (
            <p className="text-xs text-red-700">{linkState.error}</p>
          ) : linkState.message ? (
            <p className="text-xs text-emerald-800">{linkState.message}</p>
          ) : null}
        </div>
      ) : null}

      <form action={receiveAction} className="space-y-5">
        <input type="hidden" name="invoiceId" value={invoiceId} />

        <div className="space-y-3">
          {initialLines.map((line) => {
            const diff = diffs.find((d) => d.id === line.invoiceLineId);
            return (
              <div
                key={line.invoiceLineId}
                className="rounded-2xl border border-ink/8 bg-cream/40 p-4"
              >
                <input type="hidden" name="lineId" value={line.invoiceLineId} />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">
                      {line.rawDescription}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {line.itemName
                        ? `Matched: ${line.itemName}`
                        : `Unmatched · ${line.matchStatus}`}
                      {line.invoiceQuantity != null
                        ? ` · Invoice ${line.invoiceQuantity} ${line.invoiceUnit ?? ""}`
                        : ""}
                      {line.invoicedStockQty != null
                        ? ` ≈ ${line.invoicedStockQty} ${line.stockUnit}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Already received: {line.quantityReceived}{" "}
                      {line.stockUnit ?? ""}
                      {line.remainingStockQty != null
                        ? ` · Remaining: ${line.remainingStockQty}`
                        : ""}
                    </p>
                    {line.conversionError ? (
                      <p className="mt-1 text-xs text-red-700">
                        {line.conversionError}
                      </p>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(excluded[line.invoiceLineId])}
                      onChange={(event) =>
                        setExcluded((current) => ({
                          ...current,
                          [line.invoiceLineId]: event.target.checked,
                        }))
                      }
                    />
                    Exclude (non-stock)
                  </label>
                </div>
                {excluded[line.invoiceLineId] ? (
                  <input
                    type="hidden"
                    name="excludeLineId"
                    value={line.invoiceLineId}
                  />
                ) : null}
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
                      Receive now ({line.stockUnit ?? "stock unit"})
                    </label>
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      step="0.001"
                      disabled={
                        Boolean(excluded[line.invoiceLineId]) ||
                        !line.itemId ||
                        Boolean(line.conversionError)
                      }
                      value={qty[line.invoiceLineId] ?? ""}
                      onChange={(event) =>
                        setQty((current) => ({
                          ...current,
                          [line.invoiceLineId]: event.target.value,
                        }))
                      }
                      className="w-36 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  {diff && line.invoicedStockQty != null ? (
                    <p className="text-xs text-ink-muted">
                      After this:{" "}
                      {diff.vsInvoice != null && diff.vsInvoice > 0.001
                        ? `${diff.vsInvoice.toFixed(3)} still not received`
                        : diff.vsInvoice != null && diff.vsInvoice < -0.001
                          ? "Would exceed invoice qty"
                          : "Would complete this line"}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <label className="eyebrow mb-2 block text-ink-muted">Note</label>
          <input
            name="note"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            placeholder="Optional receiving note"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="allowOverReceipt"
            checked={allowOver}
            onChange={(event) => setAllowOver(event.target.checked)}
          />
          Allow over-receipt (audited)
        </label>
        {allowOver ? (
          <input
            name="overReceiptReason"
            required
            placeholder="Reason for receiving more than invoiced"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
          />
        ) : null}

        {suspected.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="acknowledgeSuspectedDuplicates"
              checked={ackSuspect}
              onChange={(event) => setAckSuspect(event.target.checked)}
            />
            I reviewed suspected manual deliveries and still want to receive
          </label>
        ) : null}

        <p className="text-xs text-ink-muted">
          Confirming receiving increases stock for the quantities entered. It
          does not change group-wide dish costing prices. Invoice document stays
          Confirmed.
        </p>

        {receiveState.error ? (
          <p className="text-sm text-red-700">{receiveState.error}</p>
        ) : receiveState.message ? (
          <p className="text-sm text-emerald-800">{receiveState.message}</p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={
            receivePending || (suspected.length > 0 && !ackSuspect)
          }
        >
          {receivePending
            ? "Receiving…"
            : "Receive Existing Invoice & Update Stock"}
        </Button>
      </form>

      <form action={markAction} className="space-y-3 rounded-2xl border border-ink/10 bg-cream/40 p-4">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <p className="text-sm font-semibold text-ink">
          Already received elsewhere
        </p>
        <p className="text-xs text-ink-muted">
          Mark this invoice fully received without increasing stock again (e.g.
          goods were booked via manual Delivery). Requires a reason.
        </p>
        <input
          name="reason"
          required
          placeholder="Reason (required)"
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
        />
        {markState.error ? (
          <p className="text-sm text-red-700">{markState.error}</p>
        ) : markState.message ? (
          <p className="text-sm text-emerald-800">{markState.message}</p>
        ) : null}
        <Button type="submit" variant="secondary" disabled={markPending}>
          {markPending ? "Saving…" : "Mark received without stock change"}
        </Button>
      </form>
    </div>
  );
}
