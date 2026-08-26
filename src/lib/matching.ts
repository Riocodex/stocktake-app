export type MatchCandidate = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  aliases: string;
};

export type MatchResult = {
  itemId: string;
  score: number;
  reason: "sku" | "exact-name" | "alias" | "fuzzy";
};

const NOISE_WORDS = new Set([
  "the",
  "a",
  "of",
  "and",
  "with",
  "bottle",
  "bottles",
  "can",
  "cans",
  "pack",
  "case",
  "box",
  "unit",
  "units",
  "ml",
  "cl",
  "l",
  "litre",
  "litres",
  "kg",
  "g",
  "x",
]);

export function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(value: string) {
  return new Set(
    normalise(value)
      .split(" ")
      .filter((token) => token.length > 1 && !NOISE_WORDS.has(token)),
  );
}

function overlapScore(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
      continue;
    }
    // Credit near-misses such as plurals or minor OCR slips.
    for (const other of b) {
      if (
        (token.length > 4 && other.startsWith(token.slice(0, 4))) ||
        (other.length > 4 && token.startsWith(other.slice(0, 4)))
      ) {
        shared += 0.5;
        break;
      }
    }
  }

  // Dice coefficient. Dividing by the smaller set instead would let a
  // one-word alias such as "milk" score a perfect match against "Oatly
  // Barista oat milk", stealing the count from the correct product.
  return (2 * shared) / (a.size + b.size);
}

/**
 * Resolves an AI-detected label to a catalogue item.
 *
 * A returned score below `threshold` means "no confident match", and the
 * caller should surface the detection for manual mapping instead of silently
 * writing it to stock.
 */
export function matchDetectedItem(
  detected: { sku: string | null; label: string },
  candidates: MatchCandidate[],
  threshold = 0.45,
): MatchResult | null {
  if (detected.sku) {
    const bySku = candidates.find(
      (candidate) =>
        candidate.sku.toLowerCase() === detected.sku!.toLowerCase().trim(),
    );
    if (bySku) return { itemId: bySku.id, score: 1, reason: "sku" };
  }

  const labelNormalised = normalise(detected.label);
  if (!labelNormalised) return null;
  const labelTokens = tokenise(detected.label);

  let best: MatchResult | null = null;

  for (const candidate of candidates) {
    const fullName = candidate.brand
      ? `${candidate.brand} ${candidate.name}`
      : candidate.name;

    if (normalise(fullName) === labelNormalised || normalise(candidate.name) === labelNormalised) {
      return { itemId: candidate.id, score: 0.98, reason: "exact-name" };
    }

    const aliasList = candidate.aliases
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean);

    if (aliasList.some((alias) => normalise(alias) === labelNormalised)) {
      return { itemId: candidate.id, score: 0.92, reason: "alias" };
    }

    let score = overlapScore(labelTokens, tokenise(fullName));
    for (const alias of aliasList) {
      score = Math.max(score, overlapScore(labelTokens, tokenise(alias)));
    }

    if (!best || score > best.score) {
      best = { itemId: candidate.id, score, reason: "fuzzy" };
    }
  }

  if (best && best.score >= threshold) return best;
  return null;
}
