"use client";

import { useActionState, useMemo, useState } from "react";

import {
  confirmDeliveryAndUpdateStockAction,
  saveInvoiceDraftAction,
  type InvoiceActionResult,
} from "../actions";
import { Button } from "@/components/ui";

const INITIAL: InvoiceActionResult = { error: null };

type LineState = {
  key: string;
  rawDescription: string;
  itemId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  needsReview: boolean;
  receivedQty: string;
  exclude: boolean;
};

type ItemOption = { id: string; name: string; sku: string; unit: string };

export function InvoiceReviewForm({
  invoiceId,
  readOnly,
  isSuper,
  outlets,
  suppliers,
  items,
  defaults,
  duplicateWarning,
  suspectedManualWarning,
  reconciliationIssues,
  receivingStatus,
}: {
  invoiceId: string;
  readOnly: boolean;
  isSuper: boolean;
  outlets: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  items: ItemOption[];
  defaults: {
    outletId: string;
    supplierId: string | null;
    supplierTextRaw: string | null;
    supplierVatRaw: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    deliveryDate: string | null;
    currency: string;
    subtotal: number | null;
    vatAmount: number | null;
    total: number | null;
    lines: LineState[];
  };
  duplicateWarning: string | null;
  suspectedManualWarning: string | null;
  reconciliationIssues: string[];
  receivingStatus: string;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveInvoiceDraftAction,
    INITIAL,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmDeliveryAndUpdateStockAction,
    INITIAL,
  );
  const [lines, setLines] = useState<LineState[]>(defaults.lines);
  const [ackDup, setAckDup] = useState(false);
  const [ackSuspect, setAckSuspect] = useState(false);

  const stockPreview = useMemo(() => {
    return lines
      .filter(
        (line) => line.itemId && !line.exclude && Number(line.receivedQty) > 0,
      )
      .map((line) => {
        const item = items.find((row) => row.id === line.itemId);
        return {
          key: line.key,
          name: item?.name ?? "Item",
          qty: line.receivedQty,
          unit: line.unit || item?.unit || "",
        };
      });
  }, [lines, items]);

  if (readOnly) {
    const fullyReceived = receivingStatus === "FULLY_RECEIVED";
    return (
      <div className="space-y-3">
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {fullyReceived
            ? "Delivery confirmed and stock updated. Document is locked."
            : "Invoice confirmed earlier without full stock receive."}
        </p>
        {!fullyReceived ? (
          <a
            href={`/app/purchasing/invoices/${invoiceId}/receive`}
            className="inline-flex text-sm font-semibold text-clay hover:underline"
          >
            Receive existing invoice (remaining goods) →
          </a>
        ) : null}
      </div>
    );
  }

  const pending = savePending || confirmPending;
  const state = confirmState.message || confirmState.error ? confirmState : saveState;

  return (
    <div className="space-y-6">
      {reconciliationIssues.length > 0 ? (
        <ul className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          {reconciliationIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {duplicateWarning ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          {duplicateWarning}
        </p>
      ) : null}
      {suspectedManualWarning ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          {suspectedManualWarning}
        </p>
      ) : null}

      <form className="space-y-5">
        <input type="hidden" name="invoiceId" value={invoiceId} />

        {isSuper ? (
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">
              Receiving outlet
            </label>
            <select
              name="outletId"
              defaultValue={defaults.outletId}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            >
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="outletId" value={defaults.outletId} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">
              Supplier (directory)
            </label>
            <select
              name="supplierId"
              defaultValue={defaults.supplierId ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            >
              <option value="">Unmatched</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">
              Supplier text
            </label>
            <input
              name="supplierTextRaw"
              defaultValue={defaults.supplierTextRaw ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">VAT</label>
            <input
              name="supplierVatRaw"
              defaultValue={defaults.supplierVatRaw ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">
              Invoice number
            </label>
            <input
              name="invoiceNumber"
              defaultValue={defaults.invoiceNumber ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">
              Invoice date
            </label>
            <input
              name="invoiceDate"
              type="date"
              defaultValue={defaults.invoiceDate ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">
              Delivery date
            </label>
            <input
              name="deliveryDate"
              type="date"
              defaultValue={defaults.deliveryDate ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">Currency</label>
            <input
              name="currency"
              defaultValue={defaults.currency}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">Subtotal</label>
            <input
              name="subtotal"
              type="number"
              step="0.01"
              defaultValue={defaults.subtotal ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">VAT amount</label>
            <input
              name="vatAmount"
              type="number"
              step="0.01"
              defaultValue={defaults.vatAmount ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block text-ink-muted">Total</label>
            <input
              name="total"
              type="number"
              step="0.01"
              defaultValue={defaults.total ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold text-ink">
            Lines — match items & qty actually received
          </h3>
          <p className="text-xs text-ink-muted">
            Invoice qty = document. Received qty = what goes into stock (may be
            less). Exclude delivery fees and non-stock charges.
          </p>
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid gap-2 rounded-2xl border border-ink/8 bg-cream/40 p-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <input type="hidden" name="lineId" value={line.key} />
              <input
                name="lineDescription"
                value={line.rawDescription}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? { ...row, rawDescription: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Description"
                className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm lg:col-span-2"
              />
              <select
                name="lineItemId"
                value={line.itemId}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? { ...row, itemId: event.target.value }
                        : row,
                    ),
                  )
                }
                className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm"
              >
                <option value="">Unmatched — cannot stock</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                  </option>
                ))}
              </select>
              <input
                name="lineQuantity"
                type="number"
                step="0.01"
                value={line.quantity}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? {
                            ...row,
                            quantity: event.target.value,
                            receivedQty:
                              row.receivedQty || event.target.value,
                          }
                        : row,
                    ),
                  )
                }
                placeholder="Invoice qty"
                className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm"
              />
              <input
                name="lineUnit"
                value={line.unit}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? { ...row, unit: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Unit"
                className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm"
              />
              <input
                name="lineReceivedQty"
                type="number"
                step="0.01"
                min="0"
                value={line.receivedQty}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? { ...row, receivedQty: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Received → stock"
                disabled={line.exclude || !line.itemId}
                className="rounded-xl border border-clay/40 bg-white px-2 py-2 text-sm font-semibold"
              />
              <input
                name="lineUnitPrice"
                type="number"
                step="0.01"
                value={line.unitPrice}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? { ...row, unitPrice: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Unit €"
                className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm"
              />
              <input
                name="lineTotal"
                type="number"
                step="0.01"
                value={line.lineTotal}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row) =>
                      row.key === line.key
                        ? { ...row, lineTotal: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Line €"
                className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm"
              />
              <input
                type="hidden"
                name="lineNeedsReview"
                value={line.needsReview ? "on" : "off"}
              />
              <input
                type="hidden"
                name="lineExclude"
                value={line.exclude ? "on" : "off"}
              />
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={line.exclude}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row) =>
                        row.key === line.key
                          ? {
                              ...row,
                              exclude: event.target.checked,
                              receivedQty: event.target.checked
                                ? ""
                                : row.receivedQty,
                            }
                          : row,
                      ),
                    )
                  }
                />
                Exclude (non-stock)
              </label>
              {line.quantity &&
              line.receivedQty &&
              Number(line.receivedQty) < Number(line.quantity) ? (
                <p className="text-xs text-amber-800 lg:col-span-3">
                  Discrepancy: invoice {line.quantity} vs received{" "}
                  {line.receivedQty} {line.unit}
                </p>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-clay"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  key: String(Date.now()),
                  rawDescription: "",
                  itemId: "",
                  quantity: "",
                  unit: "",
                  unitPrice: "",
                  lineTotal: "",
                  needsReview: true,
                  receivedQty: "",
                  exclude: false,
                },
              ])
            }
          >
            + Add line
          </button>
        </div>

        <div>
          <label className="eyebrow mb-2 block text-ink-muted">Note</label>
          <input
            name="note"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div className="rounded-2xl border border-ink/10 bg-cream/50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Will add to stock on confirm
          </p>
          {stockPreview.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">
              Match items and enter received quantities first.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {stockPreview.map((row) => (
                <li key={row.key}>
                  + {row.qty} {row.unit} · {row.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {duplicateWarning ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="acknowledgeDuplicates"
              checked={ackDup}
              onChange={(event) => setAckDup(event.target.checked)}
            />
            Acknowledge possible duplicate invoice document
          </label>
        ) : null}
        {suspectedManualWarning ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="acknowledgeSuspectedDuplicates"
              checked={ackSuspect}
              onChange={(event) => setAckSuspect(event.target.checked)}
            />
            Acknowledge possible prior manual delivery
          </label>
        ) : null}

        <p className="text-sm text-ink-muted">
          <strong>Confirm Delivery &amp; Update Stock</strong> saves the invoice
          and increases inventory in one step. Draft save and AI extraction
          never change stock. Dish costing prices are not updated.
        </p>

        {state.error ? (
          <p className="text-sm text-red-700">{state.error}</p>
        ) : state.message ? (
          <p className="text-sm text-emerald-800">{state.message}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            formAction={saveAction}
            disabled={pending}
            variant="secondary"
          >
            {savePending ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="submit"
            formAction={confirmAction}
            size="lg"
            disabled={
              pending ||
              stockPreview.length === 0 ||
              (Boolean(duplicateWarning) && !ackDup) ||
              (Boolean(suspectedManualWarning) && !ackSuspect)
            }
          >
            {confirmPending
              ? "Updating stock…"
              : "Confirm Delivery & Update Stock"}
          </Button>
        </div>
      </form>
    </div>
  );
}
