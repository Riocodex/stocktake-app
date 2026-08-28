"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import {
  addLineAction,
  resolveDetectionAction,
  submitStockTakeAction,
} from "@/lib/actions/stock";

export type CatalogueOption = {
  id: string;
  label: string;
  category: string;
  unit: string;
};

export type UnmatchedDetection = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number | null;
  unit: string | null;
  confidence: number;
  photoUrl: string | null;
};

/* --------------- Add a product by hand --------------- */

export function AddLineForm({
  stockTakeId,
  options,
}: {
  stockTakeId: string;
  options: CatalogueOption[];
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error: string | null;
    message?: string;
  } | null>(null);

  const grouped = options.reduce<Record<string, CatalogueOption[]>>(
    (accumulator, option) => {
      (accumulator[option.category] ??= []).push(option);
      return accumulator;
    },
    {},
  );

  function submit() {
    if (!itemId || quantity === "") {
      setFeedback({ error: "Pick a product and enter a quantity." });
      return;
    }

    const formData = new FormData();
    formData.set("stockTakeId", stockTakeId);
    formData.set("itemId", itemId);
    formData.set("countedQty", quantity);

    startTransition(async () => {
      const result = await addLineAction({ error: null }, formData);
      setFeedback(result);
      if (!result.error) {
        setItemId("");
        setQuantity("");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <p className="eyebrow text-ink-muted">Add a product manually</p>
      <p className="mt-1 mb-4 text-xs text-ink-muted">
        For anything the camera could not see — stock in a locked cupboard, or a
        line you want to correct by hand.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label
            htmlFor="add-item"
            className="mb-1.5 block text-[11px] font-semibold text-ink-soft"
          >
            Product
          </label>
          <select
            id="add-item"
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="">Choose a product…</option>
            {Object.entries(grouped).map(([category, items]) => (
              <optgroup key={category} label={category}>
                {items.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="w-28">
          <label
            htmlFor="add-qty"
            className="mb-1.5 block text-[11px] font-semibold text-ink-soft"
          >
            Counted
          </label>
          <input
            id="add-qty"
            type="number"
            min="0"
            step="0.01"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>

        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add line"}
        </Button>
      </div>

      {feedback?.error ? (
        <p className="mt-3 text-xs font-semibold text-red-600">
          {feedback.error}
        </p>
      ) : feedback?.message ? (
        <p className="mt-3 text-xs font-semibold text-emerald-700">
          {feedback.message}
        </p>
      ) : null}
    </Card>
  );
}

/* --------------- Map detections the matcher missed --------------- */

function DetectionRow({
  detection,
  options,
  onDone,
}: {
  detection: UnmatchedDetection;
  options: CatalogueOption[];
  onDone: () => void;
}) {
  const [itemId, setItemId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(dismiss: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set("detectionId", detection.id);
    if (dismiss) formData.set("dismiss", "1");
    else formData.set("itemId", itemId);

    startTransition(async () => {
      const result = await resolveDetectionAction({ error: null }, formData);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-ink/6 px-4 py-3 first:border-t-0">
      {detection.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={detection.photoUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl object-cover"
        />
      ) : null}

      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-semibold text-ink">“{detection.label}”</p>
        <p className="text-[11px] text-ink-muted">
          {detection.quantity} {detection.unit ?? "units"}
          {detection.unitPrice !== null
            ? ` · ${formatMoney(detection.unitPrice)} read from label`
            : ""}{" "}
          · {Math.round(detection.confidence * 100)}% confident
        </p>
        {error ? (
          <p className="text-[11px] font-semibold text-red-600">{error}</p>
        ) : null}
      </div>

      <select
        value={itemId}
        onChange={(event) => setItemId(event.target.value)}
        aria-label={`Map ${detection.label} to a product`}
        className="min-w-[12rem] rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs text-ink outline-none transition focus:border-clay"
      >
        <option value="">Map to product…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => run(false)}
          disabled={pending || !itemId}
        >
          Map
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => run(true)}
          disabled={pending}
        >
          Ignore
        </Button>
      </div>
    </li>
  );
}

export function DetectionResolver({
  detections,
  options,
}: {
  detections: UnmatchedDetection[];
  options: CatalogueOption[];
}) {
  const router = useRouter();

  return (
    <Card className="border-amber-200 bg-amber-50/50 p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-5 pb-3">
        <div>
          <p className="eyebrow text-amber-800">Needs your eyes</p>
          <p className="mt-1 text-xs text-amber-900">
            The AI read these labels but could not match them to your catalogue.
          </p>
        </div>
        <Badge tone="warn">{detections.length} unmatched</Badge>
      </div>
      <ul className="rounded-b-3xl bg-white">
        {detections.map((detection) => (
          <DetectionRow
            key={detection.id}
            detection={detection}
            options={options}
            onDone={() => router.refresh()}
          />
        ))}
      </ul>
    </Card>
  );
}

/* --------------- Submit --------------- */

export function SubmitPanel({
  stockTakeId,
  lineCount,
  totalValue,
  note,
}: {
  stockTakeId: string;
  lineCount: number;
  totalValue: number;
  note: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(note ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("stockTakeId", stockTakeId);
    formData.set("note", value);

    startTransition(async () => {
      const result = await submitStockTakeAction({ error: null }, formData);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Card className="bg-ink text-cream">
      <p className="eyebrow text-sage">Ready to file</p>
      <p className="display-heading mt-2 text-2xl text-cream">
        {lineCount} line{lineCount === 1 ? "" : "s"}
      </p>
      <p className="mt-1 text-sm text-cream/70">
        Counted value {formatMoney(totalValue)}
      </p>

      <label htmlFor="submit-note" className="eyebrow mt-6 mb-2 block text-cream/50">
        Note
      </label>
      <textarea
        id="submit-note"
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Anything the next person should know?"
        className="w-full rounded-2xl border border-cream/15 bg-cream/5 px-3 py-2.5 text-sm text-cream outline-none transition placeholder:text-cream/35 focus:border-sage"
      />

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-2xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200"
        >
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-5 space-y-3">
          <p className="text-xs leading-relaxed text-cream/70">
            This replaces the live stock quantities for this outlet with the
            counted figures. It cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="sage"
              onClick={submit}
              disabled={pending}
              className="flex-1"
            >
              {pending ? "Submitting…" : "Yes, update stock"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-cream/60 hover:bg-cream/10 hover:text-cream"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending || lineCount === 0}
          size="lg"
          className="mt-5 w-full"
        >
          Submit stock take
        </Button>
      )}
    </Card>
  );
}
