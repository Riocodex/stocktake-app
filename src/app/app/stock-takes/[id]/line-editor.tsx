"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, cn } from "@/components/ui";
import { formatMoney, formatQty, formatSigned } from "@/lib/format";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import { deleteLineAction, updateLineAction } from "@/lib/actions/stock";

export type EditableLine = {
  id: string;
  itemName: string;
  sku: string;
  unit: string;
  category: string;
  countedQty: number;
  previousQty: number;
  unitPrice: number;
  previousPrice: number;
  source: string;
  confidence: number | null;
  aiLabel: string | null;
  photoUrl: string | null;
};

function VarianceCell({ counted, previous }: { counted: number; previous: number }) {
  const delta = counted - previous;

  if (Math.abs(delta) < 0.005) {
    return <span className="text-xs text-ink-muted">no change</span>;
  }

  const ratio = previous > 0 ? Math.abs(delta) / previous : 1;
  const severe = ratio > 0.25;

  return (
    <span
      className={cn(
        "text-xs font-semibold",
        delta < 0 ? (severe ? "text-red-600" : "text-amber-700") : "text-emerald-700",
      )}
    >
      {formatSigned(delta)}
    </span>
  );
}

function LineRow({
  line,
  editable,
  onChanged,
}: {
  line: EditableLine;
  editable: boolean;
  onChanged: () => void;
}) {
  const [qty, setQty] = useState(String(line.countedQty));
  const [price, setPrice] = useState(line.unitPrice.toFixed(2));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty =
    Number(qty) !== line.countedQty ||
    Math.abs(Number(price) - line.unitPrice) > 0.005;

  function save() {
    setError(null);
    const formData = new FormData();
    formData.set("lineId", line.id);
    formData.set("countedQty", qty);
    formData.set("unitPrice", price);

    startTransition(async () => {
      const result = await updateLineAction({ error: null }, formData);
      if (result.error) setError(result.error);
      else onChanged();
    });
  }

  function remove() {
    const formData = new FormData();
    formData.set("lineId", line.id);

    startTransition(async () => {
      const result = await deleteLineAction({ error: null }, formData);
      if (result.error) setError(result.error);
      else onChanged();
    });
  }

  const lowConfidence =
    line.confidence !== null && line.confidence < LOW_CONFIDENCE_THRESHOLD;

  return (
    <tr
      className={cn(
        "transition-colors hover:bg-cream/50",
        lowConfidence && "bg-amber-50/40",
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {line.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.photoUrl}
              alt=""
              className="hidden h-9 w-9 shrink-0 rounded-lg object-cover sm:block"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {line.itemName}
            </p>
            <p className="truncate text-[11px] text-ink-muted">
              {line.sku} · {line.category}
            </p>
            {line.aiLabel && line.aiLabel !== line.itemName ? (
              <p className="truncate text-[11px] text-ink-muted italic">
                read as “{line.aiLabel}”
              </p>
            ) : null}
            {error ? (
              <p className="text-[11px] font-semibold text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-right text-xs text-ink-muted">
        {formatQty(line.previousQty)}
      </td>

      <td className="px-4 py-3 text-right">
        {editable ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            onBlur={() => dirty && save()}
            disabled={pending}
            aria-label={`Counted quantity for ${line.itemName}`}
            className="w-20 rounded-xl border border-ink/15 bg-white px-2 py-1.5 text-right text-sm font-semibold text-ink outline-none transition focus:border-clay disabled:opacity-60"
          />
        ) : (
          <span className="text-sm font-semibold text-ink">
            {formatQty(line.countedQty)}
          </span>
        )}
        <span className="ml-1 text-[11px] text-ink-muted">{line.unit}</span>
      </td>

      <td className="px-4 py-3 text-right">
        <VarianceCell counted={line.countedQty} previous={line.previousQty} />
      </td>

      <td className="px-4 py-3 text-right">
        {editable ? (
          <div className="inline-flex items-center gap-1">
            <span className="text-xs text-ink-muted">€</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onBlur={() => dirty && save()}
              disabled={pending}
              aria-label={`Unit price for ${line.itemName}`}
              className="w-20 rounded-xl border border-ink/15 bg-white px-2 py-1.5 text-right text-sm text-ink outline-none transition focus:border-clay disabled:opacity-60"
            />
          </div>
        ) : (
          <span className="text-sm text-ink">{formatMoney(line.unitPrice)}</span>
        )}
        {Math.abs(line.unitPrice - line.previousPrice) > 0.005 &&
        line.previousPrice > 0 ? (
          <p className="text-[11px] text-clay-600">
            was {formatMoney(line.previousPrice)}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-3 text-right text-sm font-semibold text-ink">
        {formatMoney(line.countedQty * line.unitPrice)}
      </td>

      <td className="px-4 py-3">
        {line.source === "AI" ? (
          <Badge tone={lowConfidence ? "warn" : "sage"}>
            AI{" "}
            {line.confidence !== null
              ? `${Math.round(line.confidence * 100)}%`
              : ""}
          </Badge>
        ) : (
          <Badge tone="neutral">Manual</Badge>
        )}
      </td>

      {editable ? (
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {dirty ? (
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-pill bg-clay px-3 py-1 text-[11px] font-bold text-white transition hover:bg-clay-600 disabled:opacity-60"
              >
                {pending ? "…" : "Save"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label={`Remove ${line.itemName}`}
              className="rounded-lg p-1.5 text-ink-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

export function LineEditor({
  lines,
  editable,
}: {
  lines: EditableLine[];
  editable: boolean;
}) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-3xl border border-ink/8 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead className="bg-cream-deep/70">
            <tr className="text-left">
              <th className="px-4 py-3 text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                Product
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                On record
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                Counted
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                Variance
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                Unit price
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                Line value
              </th>
              <th className="px-4 py-3 text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                Source
              </th>
              {editable ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/6">
            {lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                editable={editable}
                onChanged={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
