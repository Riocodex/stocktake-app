"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  WASTAGE_REASON_LABELS,
  type WastageReason,
} from "@/lib/constants";
import { Button, cn } from "@/components/ui";

type Suggestion = {
  key: string;
  itemId: string;
  name: string;
  unit: string;
  detectedQuantity: number;
  quantity: number;
  onHand: number;
  confidence: number;
  label: string;
  canWaste: boolean;
};

type AnalyzeResponse = {
  imageUrl?: string;
  provider?: string;
  simulated?: boolean;
  detected?: number;
  matched?: number;
  unmatched?: { label: string; quantity: number }[];
  suggestions?: Suggestion[];
  error?: string;
};

export function WastagePhotoPanel({
  outletId,
  simulated,
}: {
  outletId: string;
  simulated: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [unmatched, setUnmatched] = useState<{ label: string; quantity: number }[]>(
    [],
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [provider, setProvider] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const body = new FormData();
      body.set("outletId", outletId);
      body.set("photo", file);

      const response = await fetch("/api/mobile/wastage/photo", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as AnalyzeResponse;
      if (!response.ok) {
        setError(payload.error ?? "Could not analyse that photo.");
        setSuggestions([]);
        return;
      }

      const rows = payload.suggestions ?? [];
      setImageUrl(payload.imageUrl ?? null);
      setProvider(payload.provider ?? null);
      setSuggestions(rows);
      setUnmatched(payload.unmatched ?? []);
      setSelected(
        Object.fromEntries(rows.map((row) => [row.itemId, row.canWaste])),
      );
      setQuantities(
        Object.fromEntries(
          rows.map((row) => [row.itemId, String(row.quantity)]),
        ),
      );
      if (rows.length === 0) {
        setMessage(
          payload.simulated
            ? "Simulation found nothing to match. Try another photo or add products manually."
            : "Nothing in the catalogue matched this photo. Add the product manually or try a clearer shot.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Network error uploading photo.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmSelected() {
    setError(null);
    setMessage(null);
    if (!reason) {
      setError("Choose a wastage reason for the selected products.");
      return;
    }

    const lines = suggestions
      .filter((row) => selected[row.itemId])
      .map((row) => ({
        itemId: row.itemId,
        quantity: Number(quantities[row.itemId] ?? row.quantity),
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);

    if (lines.length === 0) {
      setError("Select at least one matched product with stock.");
      return;
    }

    setConfirming(true);
    try {
      const response = await fetch("/api/mobile/wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          reason,
          note: note || undefined,
          imageUrl: imageUrl || undefined,
          lines,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        count?: number;
      };
      if (!response.ok) {
        setError(payload.error ?? "Could not record wastage.");
        return;
      }
      setMessage(
        `Recorded wastage for ${payload.count ?? lines.length} product${
          (payload.count ?? lines.length) === 1 ? "" : "s"
        }.`,
      );
      setSuggestions([]);
      setUnmatched([]);
      setSelected({});
      setQuantities({});
      setPreviewUrl(null);
      setImageUrl(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Network error recording wastage.",
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border border-ink/8 bg-cream/40 p-4">
      <div>
        <p className="eyebrow text-clay">Photo wastage</p>
        <p className="mt-1 text-sm text-ink-muted">
          Photograph what was wasted. The AI matches products from your
          catalogue — you confirm before stock is reduced.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-clay px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Reading photo…" : "Take or choose photo"}
        </button>
        <span className="self-center text-xs text-ink-muted">
          JPG, PNG or WebP · up to 10MB
        </span>
      </div>

      {simulated ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Simulation mode: readings are generated locally because no vision API
          key is set.
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Wastage preview"
          className="h-36 w-full rounded-2xl object-cover"
        />
      ) : null}

      {provider ? (
        <p className="text-xs text-ink-muted">Analyser: {provider}</p>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="space-y-3">
          {suggestions.map((row) => (
            <label
              key={row.itemId}
              className={cn(
                "block rounded-2xl border bg-white p-3",
                row.canWaste ? "border-ink/10" : "border-amber-200 bg-amber-50/40",
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(selected[row.itemId])}
                  disabled={!row.canWaste}
                  onChange={(event) =>
                    setSelected((current) => ({
                      ...current,
                      [row.itemId]: event.target.checked,
                    }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{row.name}</p>
                  <p className="text-xs text-ink-muted">
                    Seen as “{row.label}” · {Math.round(row.confidence * 100)}%
                    confidence · on hand {row.onHand} {row.unit}
                  </p>
                  {!row.canWaste ? (
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      No stock at this outlet — cannot record wastage.
                    </p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-ink-muted">Qty</span>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        max={row.onHand}
                        value={quantities[row.itemId] ?? ""}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [row.itemId]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-xl border border-ink/15 px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-ink-muted">{row.unit}</span>
                    </div>
                  )}
                </div>
              </div>
            </label>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-1.5 block text-ink-muted">Reason</label>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-2xl border border-ink/15 bg-white px-3 py-2 text-sm"
              >
                <option value="">Choose…</option>
                {(Object.keys(WASTAGE_REASON_LABELS) as WastageReason[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {WASTAGE_REASON_LABELS[value]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="eyebrow mb-1.5 block text-ink-muted">
                Note (optional)
              </label>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-2xl border border-ink/15 bg-white px-3 py-2 text-sm"
                placeholder="e.g. fridge failure"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void confirmSelected()}
            disabled={confirming}
          >
            {confirming ? "Recording…" : "Confirm selected wastage"}
          </Button>
        </div>
      ) : null}

      {unmatched.length > 0 ? (
        <div className="rounded-2xl border border-ink/8 bg-white px-3 py-2">
          <p className="text-xs font-semibold text-ink">Could not match</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
            {unmatched.map((row) => (
              <li key={`${row.label}-${row.quantity}`}>
                {row.label} · {row.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm font-semibold text-sage-800">{message}</p>
      ) : null}
    </div>
  );
}
