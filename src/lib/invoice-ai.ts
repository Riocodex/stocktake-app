import { roundEuros } from "@/lib/money";

/** Avoid importing ai.ts (server-only) so scripts/tests can use this module. */
export function isInvoiceAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type ExtractedInvoiceLine = {
  rawDescription: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  needsReview: boolean;
};

export type ExtractedInvoice = {
  supplierName: string | null;
  supplierVat: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  deliveryDate: string | null;
  currency: string | null;
  subtotal: number | null;
  vatAmount: number | null;
  total: number | null;
  lines: ExtractedInvoiceLine[];
  notes: string | null;
};

export type InvoiceExtractionResult = {
  provider: string;
  data: ExtractedInvoice;
  raw: unknown;
};

export type InvoiceExtractor = (
  bytes: Uint8Array,
  mimeType: string,
) => Promise<InvoiceExtractionResult>;

const SYSTEM_PROMPT = `You are an invoice document reader for TRiBE restaurants in Malta.

Extract ONLY what is clearly visible on the supplier invoice (photo or PDF page image).

Rules:
1. Never invent missing fields. Use null when a value is not legible or absent.
2. Do not guess VAT rates from product category or supplier.
3. Preserve raw product descriptions exactly as printed (do not rewrite to catalogue names).
4. Handle discounts, credit notes, shipping and unusual layouts conservatively — put uncertain lines with needsReview=true.
5. Dates as ISO YYYY-MM-DD when possible, otherwise null.
6. Money as plain numbers (no currency symbols). Currency as ISO code (usually EUR).

Respond with JSON only:
{
  "supplierName": string|null,
  "supplierVat": string|null,
  "invoiceNumber": string|null,
  "invoiceDate": string|null,
  "deliveryDate": string|null,
  "currency": string|null,
  "subtotal": number|null,
  "vatAmount": number|null,
  "total": number|null,
  "notes": string|null,
  "lines": [{
    "rawDescription": string,
    "quantity": number|null,
    "unit": string|null,
    "unitPrice": number|null,
    "lineTotal": number|null,
    "vatRate": number|null,
    "vatAmount": number|null,
    "needsReview": boolean
  }]
}`;

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, 500);
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return roundEuros(n);
}

function asNullableDate(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  // Accept YYYY-MM-DD or parseable dates → ISO date only.
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(raw);
  if (iso) return iso[0];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Coerce model / mock JSON into a safe ExtractedInvoice (nulls for unknowns). */
export function normaliseInvoiceExtraction(value: unknown): ExtractedInvoice {
  const row =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const rawLines = Array.isArray(row.lines) ? row.lines : [];
  const lines: ExtractedInvoiceLine[] = [];

  for (const entry of rawLines) {
    if (!entry || typeof entry !== "object") continue;
    const line = entry as Record<string, unknown>;
    const rawDescription =
      asNullableString(line.rawDescription) ??
      asNullableString(line.description) ??
      asNullableString(line.name);
    if (!rawDescription) continue;

    const quantity = asNullableNumber(line.quantity);
    const unitPrice = asNullableNumber(line.unitPrice ?? line.price);
    let lineTotal = asNullableNumber(line.lineTotal ?? line.total);
    if (
      lineTotal === null &&
      quantity !== null &&
      unitPrice !== null &&
      quantity >= 0 &&
      unitPrice >= 0
    ) {
      lineTotal = roundEuros(quantity * unitPrice);
    }

    lines.push({
      rawDescription,
      quantity: quantity !== null && quantity < 0 ? null : quantity,
      unit: asNullableString(line.unit),
      unitPrice: unitPrice !== null && unitPrice < 0 ? null : unitPrice,
      lineTotal: lineTotal !== null && lineTotal < 0 ? null : lineTotal,
      vatRate: asNullableNumber(line.vatRate),
      vatAmount: asNullableNumber(line.vatAmount),
      needsReview: Boolean(line.needsReview),
    });
  }

  return {
    supplierName: asNullableString(row.supplierName ?? row.supplier),
    supplierVat: asNullableString(row.supplierVat ?? row.vatNumber),
    invoiceNumber: asNullableString(row.invoiceNumber ?? row.number),
    invoiceDate: asNullableDate(row.invoiceDate ?? row.date),
    deliveryDate: asNullableDate(row.deliveryDate),
    currency: (asNullableString(row.currency) ?? "EUR")?.toUpperCase() ?? "EUR",
    subtotal: asNullableNumber(row.subtotal),
    vatAmount: asNullableNumber(row.vatAmount ?? row.vat),
    total: asNullableNumber(row.total ?? row.grandTotal),
    lines,
    notes: asNullableString(row.notes),
  };
}

function hashBytes(bytes: Uint8Array) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic offline stand-in so upload → review works without an API key.
 * Does not invent catalogue matches — only plausible header/line placeholders.
 */
export function simulateInvoiceExtraction(
  bytes: Uint8Array,
): InvoiceExtractionResult {
  const seed = hashBytes(bytes);
  const suffix = String(seed % 9000 + 1000);
  const data = normaliseInvoiceExtraction({
    supplierName: "Sample Produce Co",
    supplierVat: null,
    invoiceNumber: `SIM-${suffix}`,
    invoiceDate: "2026-03-15",
    deliveryDate: null,
    currency: "EUR",
    subtotal: 42.5,
    vatAmount: 7.65,
    total: 50.15,
    notes: "Simulated extraction — configure OPENAI_API_KEY for real AI.",
    lines: [
      {
        rawDescription: "Tomatoes vine 5kg crate",
        quantity: 2,
        unit: "crate",
        unitPrice: 12.5,
        lineTotal: 25,
        vatRate: null,
        vatAmount: null,
        needsReview: false,
      },
      {
        rawDescription: "Avocados ripe case",
        quantity: 1,
        unit: "case",
        unitPrice: 17.5,
        lineTotal: 17.5,
        vatRate: null,
        vatAmount: null,
        needsReview: true,
      },
    ],
  });

  return {
    provider: "simulated",
    data,
    raw: { simulated: true, seed, data },
  };
}

async function extractWithOpenAI(
  bytes: Uint8Array,
  mimeType: string,
): Promise<InvoiceExtractionResult> {
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // PDFs: OpenAI vision expects images; send as file note when PDF —
  // many deployments still pass image photos from mobile. For PDF, we
  // still attempt image_url with application/pdf data URL when supported;
  // on failure the caller marks FAILED.
  const contentParts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: string } }
  > = [
    {
      type: "text",
      text: "Extract the supplier invoice fields from this document.",
    },
    {
      type: "image_url",
      image_url: { url: dataUrl, detail: "high" },
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contentParts },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Invoice vision API returned ${response.status}: ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Invoice vision API did not return valid JSON.");
  }

  return {
    provider: `openai:${model}`,
    data: normaliseInvoiceExtraction(parsed),
    raw: parsed,
  };
}

/** Default extractor: OpenAI when configured, otherwise simulated. */
export const defaultInvoiceExtractor: InvoiceExtractor = async (
  bytes,
  mimeType,
) => {
  if (!isInvoiceAiConfigured()) {
    return simulateInvoiceExtraction(bytes);
  }
  return extractWithOpenAI(bytes, mimeType);
};
