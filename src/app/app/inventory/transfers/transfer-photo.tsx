"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
  canTransfer: boolean;
};

type AnalyzeResponse = {
  imageUrl?: string;
  provider?: string;
  simulated?: boolean;
  suggestions?: Suggestion[];
  unmatched?: { label: string; quantity: number }[];
  error?: string;
};

export function TransferPhotoPanel({
  fromOutletId,
  toOutletId,
  note,
  simulated,
}: {
  fromOutletId: string;
  toOutletId: string;
  note?: string;
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
  const [unmatched, setUnmatched] = useState<
    { label: string; quantity: number }[]
  >([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!fromOutletId) {
      setError("Choose the source outlet before photographing stock.");
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const body = new FormData();
      body.set("outletId", fromOutletId);
      body.set("photo", file);

      const response = await fetch("/api/mobile/transfers/photo", {
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
        Object.fromEntries(rows.map((row) => [row.itemId, row.canTransfer])),
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
            : "Nothing in the catalogue matched this photo. Add products manually or try a clearer shot.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Network error uploading photo.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmPhotoTransfer() {
    setError(null);
    setMessage(null);
    if (!toOutletId) {
      setError("Choose the destination outlet above first.");
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
      setError("Select at least one matched product with a quantity.");
      return;
    }

    setConfirming(true);
    try {
      const response = await fetch("/api/mobile/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromOutletId,
          toOutletId,
          note: note || undefined,
          imageUrl: imageUrl || undefined,
          lines,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        transfer?: { id: string };
      };
      if (!response.ok || !payload.transfer?.id) {
        setError(payload.error ?? "Could not create the transfer draft.");
        return;
      }
      router.push(`/app/inventory/transfers/${payload.transfer.id}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Network error creating transfer.",
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border border-ink/8 bg-cream/40 p-4">
      <div>
        <p className="eyebrow text-clay">Photo transfer</p>
        <p className="mt-1 text-sm text-ink-muted">
          Photograph what you are sending. Confirm the matched products and
          quantities — that creates the draft. No manual product pick needed.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !fromOutletId}
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
          alt="Transfer preview"
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
                row.canTransfer
                  ? "border-ink/10"
                  : "border-amber-200 bg-amber-50/40",
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(selected[row.itemId])}
                  disabled={!row.canTransfer}
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
                  {!row.canTransfer ? (
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      No stock at source — cannot transfer.
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

          {!toOutletId ? (
            <p className="text-sm font-semibold text-amber-800">
              Choose the destination outlet above, then confirm.
            </p>
          ) : null}

          <Button
            type="button"
            onClick={() => void confirmPhotoTransfer()}
            disabled={confirming || busy}
          >
            {confirming ? "Saving draft…" : "Confirm photo transfer"}
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
