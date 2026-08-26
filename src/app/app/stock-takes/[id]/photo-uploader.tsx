"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { cn } from "@/components/ui";

type UploadState = {
  id: string;
  name: string;
  previewUrl: string;
  status: "queued" | "uploading" | "done" | "error";
  detected?: number;
  matched?: number;
  unmatched?: number;
  provider?: string;
  error?: string;
};

type UploadResponse = {
  detected?: number;
  matched?: number;
  unmatched?: number;
  provider?: string;
  error?: string;
};

export function PhotoUploader({
  stockTakeId,
  simulated,
}: {
  stockTakeId: string;
  simulated: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(id: string, patch: Partial<UploadState>) {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;

    const queued: UploadState[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
    }));

    setUploads((current) => [...current, ...queued]);
    setBusy(true);

    // Sequential rather than parallel: analysing several images at once would
    // race on the shared "merge into existing line" logic.
    for (const [index, file] of files.entries()) {
      const entry = queued[index];
      update(entry.id, { status: "uploading" });

      try {
        const body = new FormData();
        body.append("photo", file);

        const response = await fetch(
          `/api/stock-takes/${stockTakeId}/photos`,
          { method: "POST", body },
        );
        const payload = (await response.json()) as UploadResponse;

        if (!response.ok) {
          update(entry.id, {
            status: "error",
            error: payload.error ?? `Upload failed (${response.status})`,
          });
          continue;
        }

        update(entry.id, {
          status: "done",
          detected: payload.detected,
          matched: payload.matched,
          unmatched: payload.unmatched,
          provider: payload.provider,
        });
      } catch (error) {
        update(entry.id, {
          status: "error",
          error:
            error instanceof Error ? error.message : "Network error uploading photo.",
        });
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-clay bg-clay-50"
            : "border-ink/15 bg-white hover:border-clay-300",
        )}
      >
        <div
          className={cn(
            "mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-clay-50 text-clay",
            busy && "animate-pulse-ring",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M4 8V6a2 2 0 0 1 2-2h1.5l1-2h5l1 2H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </div>

        <p className="display-heading text-lg text-ink">
          {busy ? "Analysing photos…" : "Add shelf photos"}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          Take a photo of each storage area, or drop images here. The AI counts
          the units and reads any visible price tags.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-pill bg-clay px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clay-600 disabled:opacity-60"
          >
            {busy ? "Working…" : "Choose or capture photos"}
          </button>
          <span className="text-xs text-ink-muted">
            JPG, PNG or WebP · up to 10MB each
          </span>
        </div>

        {simulated ? (
          <p className="mx-auto mt-4 max-w-md rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Simulation mode: readings are generated locally because no vision API
            key is set.
          </p>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      {uploads.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {uploads.map((upload) => (
            <li
              key={upload.id}
              className="flex items-center gap-3 rounded-2xl border border-ink/8 bg-white px-3 py-2.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={upload.previewUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">
                  {upload.name}
                </p>
                <p className="truncate text-[11px] text-ink-muted">
                  {upload.status === "uploading"
                    ? "Uploading and analysing…"
                    : upload.status === "queued"
                      ? "Waiting…"
                      : upload.status === "error"
                        ? upload.error
                        : `${upload.detected ?? 0} detected · ${
                            upload.matched ?? 0
                          } matched${
                            upload.unmatched
                              ? ` · ${upload.unmatched} need mapping`
                              : ""
                          }`}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-pill px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  upload.status === "done" && "bg-emerald-50 text-emerald-700",
                  upload.status === "error" && "bg-red-50 text-red-700",
                  (upload.status === "uploading" || upload.status === "queued") &&
                    "bg-clay-50 text-clay-700",
                )}
              >
                {upload.status === "done"
                  ? "Analysed"
                  : upload.status === "error"
                    ? "Failed"
                    : upload.status === "uploading"
                      ? "Working"
                      : "Queued"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
