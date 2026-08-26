import { prisma } from "@/lib/db";
import { LINE_SOURCE, STOCK_TAKE_STATUS } from "@/lib/constants";
import type { CatalogueEntry, DetectedItem } from "@/lib/ai";
import { matchDetectedItem, type MatchCandidate } from "@/lib/matching";

/**
 * Builds the prompt catalogue for an outlet: every active global item, joined
 * with that outlet's current quantity and price.
 */
export async function getCatalogueForOutlet(
  outletId: string,
): Promise<CatalogueEntry[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    include: {
      outletStock: { where: { outletId }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return items.map((item) => {
    const stock = item.outletStock[0];
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      unit: item.unit,
      packSize: item.packSize,
      aliases: item.aliases,
      referencePrice: item.referencePrice,
      currentQty: stock?.quantity ?? 0,
      currentPrice: stock?.unitPrice || item.referencePrice,
    };
  });
}

export async function nextStockTakeReference() {
  const year = new Date().getFullYear();
  const prefix = `ST-${year}-`;

  const latest = await prisma.stockTake.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const sequence = latest
    ? Number.parseInt(latest.reference.slice(prefix.length), 10) + 1
    : 1;

  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export type AppliedDetection = {
  detected: DetectedItem;
  itemId: string | null;
  matchReason: string | null;
  merged: boolean;
};

/**
 * Turns raw model detections into draft stock-take lines.
 *
 * Detections that cannot be matched to the catalogue are returned as
 * `itemId: null` so the UI can ask a human to map them, rather than being
 * silently dropped or written to the wrong product.
 */
export async function applyDetectionsToStockTake(options: {
  stockTakeId: string;
  outletId: string;
  photoId: string;
  detections: DetectedItem[];
}): Promise<AppliedDetection[]> {
  const { stockTakeId, outletId, photoId, detections } = options;

  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, brand: true, aliases: true },
  });

  const candidates: MatchCandidate[] = items;
  const results: AppliedDetection[] = [];

  for (const detected of detections) {
    const match = matchDetectedItem(detected, candidates);

    // Keep a record of the raw reading either way, so nothing the model saw is
    // lost and unmatched labels can be mapped by hand later.
    await prisma.photoDetection.create({
      data: {
        photoId,
        stockTakeId,
        label: detected.label,
        quantity: detected.quantity,
        unitPrice: detected.unitPrice,
        unit: detected.unit,
        confidence: detected.confidence,
        sku: detected.sku,
        status: match ? "MATCHED" : "UNMATCHED",
        matchedItemId: match?.itemId ?? null,
        matchReason: match?.reason ?? null,
      },
    });

    if (!match) {
      results.push({ detected, itemId: null, matchReason: null, merged: false });
      continue;
    }

    const [outletStock, existingLine] = await Promise.all([
      prisma.outletStock.findUnique({
        where: { outletId_itemId: { outletId, itemId: match.itemId } },
      }),
      prisma.stockTakeLine.findUnique({
        where: { stockTakeId_itemId: { stockTakeId, itemId: match.itemId } },
      }),
    ]);

    const item = await prisma.inventoryItem.findUnique({
      where: { id: match.itemId },
      select: { referencePrice: true },
    });

    const previousQty = outletStock?.quantity ?? 0;
    const previousPrice = outletStock?.unitPrice || item?.referencePrice || 0;
    const price = detected.unitPrice ?? previousPrice;

    if (existingLine) {
      // The same product showing up in a second photo adds to the count
      // rather than overwriting it.
      await prisma.stockTakeLine.update({
        where: { id: existingLine.id },
        data: {
          countedQty: existingLine.countedQty + detected.quantity,
          unitPrice: detected.unitPrice ?? existingLine.unitPrice,
          confidence:
            existingLine.confidence === null
              ? detected.confidence
              : Math.min(existingLine.confidence, detected.confidence),
          aiLabel: `${existingLine.aiLabel ?? ""}; ${detected.label}`.slice(0, 400),
        },
      });

      results.push({
        detected,
        itemId: match.itemId,
        matchReason: match.reason,
        merged: true,
      });
      continue;
    }

    await prisma.stockTakeLine.create({
      data: {
        stockTakeId,
        itemId: match.itemId,
        photoId,
        countedQty: detected.quantity,
        previousQty,
        unitPrice: price,
        previousPrice,
        source: LINE_SOURCE.AI,
        confidence: detected.confidence,
        aiLabel: detected.label,
      },
    });

    results.push({
      detected,
      itemId: match.itemId,
      matchReason: match.reason,
      merged: false,
    });
  }

  return results;
}

/**
 * Commits a draft stock take.
 *
 * Counted quantities become the outlet's live stock position, any price the
 * model read replaces the outlet price, and every price movement is written to
 * the audit trail. Runs in a transaction so a partial apply cannot happen.
 */
export async function submitStockTake(stockTakeId: string) {
  const stockTake = await prisma.stockTake.findUnique({
    where: { id: stockTakeId },
    include: { lines: true },
  });

  if (!stockTake) throw new Error("Stock take not found.");
  if (stockTake.status === STOCK_TAKE_STATUS.SUBMITTED) {
    throw new Error("This stock take has already been submitted.");
  }
  if (stockTake.lines.length === 0) {
    throw new Error("Add at least one counted line before submitting.");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const line of stockTake.lines) {
      const existing = await tx.outletStock.findUnique({
        where: {
          outletId_itemId: { outletId: stockTake.outletId, itemId: line.itemId },
        },
      });

      const previousPrice = existing?.unitPrice ?? 0;

      await tx.outletStock.upsert({
        where: {
          outletId_itemId: { outletId: stockTake.outletId, itemId: line.itemId },
        },
        create: {
          outletId: stockTake.outletId,
          itemId: line.itemId,
          quantity: line.countedQty,
          unitPrice: line.unitPrice,
          lastCountedAt: now,
        },
        update: {
          quantity: line.countedQty,
          unitPrice: line.unitPrice,
          lastCountedAt: now,
        },
      });

      if (line.unitPrice > 0 && Math.abs(line.unitPrice - previousPrice) > 0.005) {
        await tx.priceHistory.create({
          data: {
            itemId: line.itemId,
            outletId: stockTake.outletId,
            price: line.unitPrice,
            previousPrice: previousPrice || null,
            source: line.source,
          },
        });
      }
    }

    await tx.stockTake.update({
      where: { id: stockTakeId },
      data: { status: STOCK_TAKE_STATUS.SUBMITTED, submittedAt: now },
    });

    await tx.activityLog.create({
      data: {
        userId: stockTake.userId,
        outletId: stockTake.outletId,
        action: "STOCK_TAKE_SUBMITTED",
        detail: `${stockTake.reference} · ${stockTake.lines.length} lines`,
      },
    });
  });

  return { lines: stockTake.lines.length };
}

/** Total value of stock currently held, optionally narrowed to one outlet. */
export async function getStockValue(outletId?: string | null) {
  const rows = await prisma.outletStock.findMany({
    where: outletId ? { outletId } : undefined,
    select: { quantity: true, unitPrice: true },
  });

  return rows.reduce((total, row) => total + row.quantity * row.unitPrice, 0);
}
