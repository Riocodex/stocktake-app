import "server-only";

export type CatalogueEntry = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  packSize: string | null;
  aliases: string;
  referencePrice: number;
  currentQty: number;
  currentPrice: number;
};

export type DetectedItem = {
  /** SKU the model believes it matched, if any. */
  sku: string | null;
  /** Raw human-readable label the model read off the photo. */
  label: string;
  quantity: number;
  /** Price read from a visible tag/label, or null if none was legible. */
  unitPrice: number | null;
  unit: string | null;
  /** 0..1 */
  confidence: number;
  notes?: string | null;
};

export type AnalysisResult = {
  provider: string;
  items: DetectedItem[];
  raw: unknown;
};

const SYSTEM_PROMPT = `You are a stock-taking assistant for TRiBE, a group of all-day dining restaurants in Malta.

You are given ONE photograph of a storage area (shelf, fridge, back bar, dry store or delivery crate) and the venue's product catalogue.

Your job is to count what is visible and return structured stock data.

Rules:
1. Count the number of individual sellable units visible for each distinct product. Count only what you can actually see; never guess at items hidden behind others unless a full row is clearly visible, in which case count the visible front row only.
2. Match each product to the catalogue by "sku" whenever you are reasonably sure. If a visible product is genuinely not in the catalogue, set "sku" to null and put your best reading of the label in "label".
3. If a price tag, shelf label or handwritten price is legible in the photo, report it as "unitPrice" as a plain number in EUR. If no price is legible, set "unitPrice" to null. Never invent a price.
4. "confidence" is your own certainty for that line, from 0 to 1. Use lower values for partially hidden, blurry or ambiguous products.
5. Ignore anything that is not stock: people, furniture, equipment, cleaning tools, signage.

Respond with JSON only, in exactly this shape:
{"items":[{"sku":"...|null","label":"...","quantity":0,"unitPrice":0|null,"unit":"bottle","confidence":0.0,"notes":"optional short note"}]}`;

function buildCataloguePrompt(catalogue: CatalogueEntry[]) {
  const lines = catalogue.map((entry) => {
    const aliases = entry.aliases
      ? ` | also known as: ${entry.aliases}`
      : "";
    const pack = entry.packSize ? ` | pack: ${entry.packSize}` : "";
    return `- sku=${entry.sku} | ${entry.name}${
      entry.brand ? ` (${entry.brand})` : ""
    } | unit: ${entry.unit}${pack} | last known price: EUR ${entry.referencePrice.toFixed(
      2,
    )}${aliases}`;
  });

  return `Product catalogue for this venue:\n${lines.join("\n")}`;
}

/** Coerces whatever the model returned into a clean DetectedItem[]. */
function normaliseItems(value: unknown): DetectedItem[] {
  const container = value as { items?: unknown } | null;
  const rawItems = Array.isArray(container?.items)
    ? container.items
    : Array.isArray(value)
      ? value
      : [];

  const items: DetectedItem[] = [];

  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : typeof row.name === "string"
          ? String(row.name).trim()
          : "";

    const quantity = Number(row.quantity ?? row.count ?? 0);
    if (!label || !Number.isFinite(quantity) || quantity <= 0) continue;

    const priceValue = Number(row.unitPrice ?? row.price);
    const confidenceValue = Number(row.confidence);

    items.push({
      sku:
        typeof row.sku === "string" && row.sku.trim() && row.sku !== "null"
          ? row.sku.trim()
          : null,
      label,
      quantity: Math.round(quantity * 100) / 100,
      unitPrice:
        Number.isFinite(priceValue) && priceValue > 0
          ? Math.round(priceValue * 100) / 100
          : null,
      unit: typeof row.unit === "string" && row.unit.trim() ? row.unit.trim() : null,
      confidence: Number.isFinite(confidenceValue)
        ? Math.min(Math.max(confidenceValue, 0), 1)
        : 0.6,
      notes: typeof row.notes === "string" ? row.notes.slice(0, 240) : null,
    });
  }

  return items;
}

export function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function analyseWithOpenAI(
  imageDataUrl: string,
  catalogue: CatalogueEntry[],
): Promise<AnalysisResult> {
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

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
        {
          role: "user",
          content: [
            { type: "text", text: buildCataloguePrompt(catalogue) },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Vision API returned ${response.status}: ${detail.slice(0, 300)}`,
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
    throw new Error("Vision API did not return valid JSON.");
  }

  return {
    provider: `openai:${model}`,
    items: normaliseItems(parsed),
    raw: parsed,
  };
}

/** Stable 32-bit hash so a given photo always simulates the same result. */
function hashBytes(bytes: Uint8Array) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Offline stand-in for the vision model.
 *
 * It produces a plausible, deterministic reading of the photo so the entire
 * capture -> review -> submit flow can be demonstrated and tested without an
 * API key. Results are seeded from the image bytes, so re-analysing the same
 * photo yields the same counts.
 */
function analyseSimulated(
  bytes: Uint8Array,
  catalogue: CatalogueEntry[],
): AnalysisResult {
  const random = mulberry32(hashBytes(bytes));

  const pool = [...catalogue];
  // Fisher-Yates using the seeded generator.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const detectCount = Math.min(pool.length, 3 + Math.floor(random() * 4));
  const items: DetectedItem[] = [];

  for (const entry of pool.slice(0, detectCount)) {
    // Simulate a count that drifts around the last known quantity.
    const base = entry.currentQty > 0 ? entry.currentQty : 6 + random() * 18;
    const drift = (random() - 0.45) * 0.4;
    const quantity = Math.max(0, Math.round(base * (1 + drift)));
    if (quantity === 0) continue;

    // Roughly half the time a price tag is "legible" and has moved a little.
    const priceVisible = random() > 0.5;
    const reference = entry.currentPrice || entry.referencePrice;
    const unitPrice =
      priceVisible && reference > 0
        ? Math.round(reference * (1 + (random() - 0.4) * 0.12) * 100) / 100
        : null;

    items.push({
      sku: entry.sku,
      label: entry.brand ? `${entry.brand} ${entry.name}` : entry.name,
      quantity,
      unitPrice,
      unit: entry.unit,
      confidence: Math.round((0.62 + random() * 0.36) * 100) / 100,
      notes: null,
    });
  }

  return {
    provider: "simulated",
    items,
    raw: { simulated: true, items },
  };
}

export async function analyseStockPhoto(
  bytes: Uint8Array,
  mimeType: string,
  catalogue: CatalogueEntry[],
): Promise<AnalysisResult> {
  if (catalogue.length === 0) {
    return { provider: "none", items: [], raw: { error: "empty catalogue" } };
  }

  if (!isAiConfigured()) {
    return analyseSimulated(bytes, catalogue);
  }

  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return analyseWithOpenAI(dataUrl, catalogue);
}
