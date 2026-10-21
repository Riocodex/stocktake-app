import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INVOICE_DIR = path.join(process.cwd(), "storage", "invoices");
export const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

export const INVOICE_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

function extensionFor(mime: string) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "application/pdf":
      return "pdf";
    default:
      return "jpg";
  }
}

/**
 * Persist an invoice document outside public/. Returns opaque fileKey only.
 * Local disk — fine for single-server/SQLite; ephemeral on serverless hosts.
 */
export async function saveInvoiceDocument(input: {
  bytes: Buffer | Uint8Array;
  mimeType: string;
  originalName?: string | null;
}): Promise<{ fileKey: string; fileMimeType: string; fileName: string | null }> {
  const mime = String(input.mimeType || "").toLowerCase().trim();
  if (!INVOICE_ALLOWED_MIME.has(mime)) {
    throw new Error(
      `Unsupported file type: ${mime || "unknown"}. Use JPEG, PNG, WebP, HEIC or PDF.`,
    );
  }

  const bytes = Buffer.from(input.bytes);
  if (bytes.length === 0) throw new Error("That file is empty.");
  if (bytes.length > INVOICE_MAX_BYTES) {
    throw new Error("Invoice files must be under 10MB.");
  }

  const fileKey = `${randomUUID()}.${extensionFor(mime)}`;
  await mkdir(INVOICE_DIR, { recursive: true });
  await writeFile(path.join(INVOICE_DIR, fileKey), bytes);

  const original = String(input.originalName ?? "").trim() || null;
  return {
    fileKey,
    fileMimeType: mime,
    fileName: original ? original.slice(0, 200) : null,
  };
}

export async function readInvoiceDocument(fileKey: string): Promise<Buffer> {
  const safe = path.basename(fileKey);
  if (safe !== fileKey || fileKey.includes("..")) {
    throw new Error("Invalid file reference.");
  }
  return readFile(path.join(INVOICE_DIR, safe));
}

export function validateInvoiceUploadMeta(mimeType: string, size: number) {
  const mime = String(mimeType || "").toLowerCase().trim();
  if (!INVOICE_ALLOWED_MIME.has(mime)) {
    return {
      ok: false as const,
      error: `Unsupported file type: ${mime || "unknown"}.`,
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false as const, error: "That file is empty." };
  }
  if (size > INVOICE_MAX_BYTES) {
    return { ok: false as const, error: "Invoice files must be under 10MB." };
  }
  return { ok: true as const, mime };
}
