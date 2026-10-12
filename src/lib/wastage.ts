import "server-only";

import {
  assertOutletAccess,
  isSuperAdmin,
  type SessionUser,
} from "@/lib/auth";
import { analyseStockPhoto, isAiConfigured } from "@/lib/ai";
import {
  WASTAGE_REASON_LABELS,
  WASTAGE_TARGET,
  isWastageReason,
  type WastageReason,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatMoney, formatQty } from "@/lib/format";
import { matchDetectedItem } from "@/lib/matching";
import { getCatalogueForOutlet } from "@/lib/stock";

export type RecordWastageInput = {
  outletId?: string | null;
  itemId: string;
  quantity: number;
  reason: string;
  note?: string | null;
  imageUrl?: string | null;
};

export type RecordWastageResult =
  | {
      ok: true;
      wastage: {
        id: string;
        itemId: string;
        quantity: number;
        unit: string;
        unitCost: number;
        value: number;
        reason: WastageReason;
        remainingQuantity: number;
      };
    }
  | { ok: false; error: string };

/**
 * Records item wastage and decreases live OutletStock in one transaction.
 * Unit cost is snapshotted so history stays accurate if prices change later.
 */
export async function recordItemWastage(
  user: SessionUser,
  input: RecordWastageInput,
): Promise<RecordWastageResult> {
  const requestedOutlet = String(input.outletId ?? "").trim();
  const outletId = isSuperAdmin(user) ? requestedOutlet : user.outletId;
  const itemId = String(input.itemId ?? "").trim();
  const note = String(input.note ?? "").trim();
  const quantity = Number(input.quantity);
  const reasonRaw = String(input.reason ?? "").trim();

  if (!outletId) return { ok: false, error: "Choose which outlet this wastage is for." };

  // Outlet admins must not be able to aim a request at another venue, even if
  // we would otherwise ignore the field and fall back to their own outlet.
  if (
    !isSuperAdmin(user) &&
    requestedOutlet &&
    requestedOutlet !== user.outletId
  ) {
    return { ok: false, error: "You do not have access to that outlet." };
  }

  try {
    assertOutletAccess(user, outletId);
  } catch {
    return { ok: false, error: "You do not have access to that outlet." };
  }

  if (!itemId) return { ok: false, error: "Choose which product was wasted." };
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be greater than zero." };
  }
  if (!isWastageReason(reasonRaw)) {
    return { ok: false, error: "Choose a wastage reason." };
  }
  const reason: WastageReason = reasonRaw;

  const roundedQty = Math.round(quantity * 100) / 100;

  try {
    const wastage = await prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.findUnique({
        where: { id: outletId },
        select: { id: true, name: true, isActive: true },
      });
      if (!outlet || !outlet.isActive) {
        throw new Error("That outlet no longer exists.");
      }

      const item = await tx.inventoryItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          unit: true,
          referencePrice: true,
          isActive: true,
        },
      });
      if (!item || !item.isActive) {
        throw new Error("That product is not in the catalogue.");
      }

      const stock = await tx.outletStock.findUnique({
        where: { outletId_itemId: { outletId, itemId } },
      });
      const currentQty = stock?.quantity ?? 0;
      if (!stock || currentQty <= 0) {
        throw new Error(
          `Cannot record ${formatQty(roundedQty)} ${item.unit} of wastage. Current stock is 0 ${item.unit}.`,
        );
      }
      if (roundedQty > currentQty) {
        throw new Error(
          `Cannot record ${formatQty(roundedQty)} ${item.unit} of wastage. Current stock is ${formatQty(currentQty)} ${item.unit}.`,
        );
      }

      const unitCost =
        Math.round(
          ((stock.unitPrice && stock.unitPrice > 0
            ? stock.unitPrice
            : item.referencePrice) ||
            0) * 100,
        ) / 100;

      // Conditional decrement: if another request already spent the stock,
      // count stays 0 and the transaction rolls back (no orphan wastage row).
      const depleted = await tx.outletStock.updateMany({
        where: {
          id: stock.id,
          quantity: { gte: roundedQty },
        },
        data: {
          quantity: { decrement: roundedQty },
        },
      });
      if (depleted.count !== 1) {
        const fresh = await tx.outletStock.findUnique({
          where: { id: stock.id },
          select: { quantity: true },
        });
        throw new Error(
          `Cannot record ${formatQty(roundedQty)} ${item.unit} of wastage. Current stock is ${formatQty(fresh?.quantity ?? 0)} ${item.unit}.`,
        );
      }

      const imageUrl = String(input.imageUrl ?? "").trim() || null;

      const created = await tx.wastage.create({
        data: {
          outletId,
          itemId,
          targetType: WASTAGE_TARGET.ITEM,
          quantity: roundedQty,
          unit: item.unit,
          unitCost,
          reason,
          note: note || null,
          imageUrl,
          userId: user.id,
        },
      });

      const remaining = await tx.outletStock.findUnique({
        where: { id: stock.id },
        select: { quantity: true },
      });
      const remainingQuantity =
        Math.round((remaining?.quantity ?? 0) * 100) / 100;

      const value = Math.round(roundedQty * unitCost * 100) / 100;
      await tx.activityLog.create({
        data: {
          userId: user.id,
          outletId,
          action: "WASTAGE_RECORDED",
          detail: `${item.name} · ${formatQty(roundedQty)} ${item.unit} · ${WASTAGE_REASON_LABELS[reason]} · ${formatMoney(value)}`,
        },
      });

      return {
        id: created.id,
        itemId,
        quantity: created.quantity,
        unit: created.unit,
        unitCost: created.unitCost,
        value,
        reason,
        remainingQuantity,
      };
    });

    return { ok: true, wastage };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not record wastage.",
    };
  }
}

export type WastageListFilters = {
  outletId?: string | null;
  itemId?: string | null;
  reason?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  take?: number;
};

export async function listWastage(
  user: SessionUser,
  filters: WastageListFilters = {},
) {
  const scopeOutlet = isSuperAdmin(user)
    ? filters.outletId && filters.outletId !== "all"
      ? filters.outletId
      : null
    : user.outletId;

  if (!isSuperAdmin(user) && !scopeOutlet) {
    return { rows: [], summary: emptySummary() };
  }

  if (scopeOutlet) {
    try {
      assertOutletAccess(user, scopeOutlet);
    } catch {
      return { rows: [], summary: emptySummary() };
    }
  }

  const search = (filters.q ?? "").trim();
  const reason =
    filters.reason && isWastageReason(filters.reason) ? filters.reason : null;
  const itemId = (filters.itemId ?? "").trim() || null;

  const fromDate = parseDayStart(filters.from);
  const toDate = parseDayEnd(filters.to);

  const where = {
    targetType: WASTAGE_TARGET.ITEM,
    ...(scopeOutlet ? { outletId: scopeOutlet } : {}),
    ...(itemId ? { itemId } : {}),
    ...(reason ? { reason } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { item: { name: { contains: search } } },
            { item: { sku: { contains: search } } },
            { item: { brand: { contains: search } } },
            { note: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, todayRows] = await Promise.all([
    prisma.wastage.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, brand: true, sku: true } },
        outlet: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: filters.take ?? 100,
    }),
    prisma.wastage.findMany({
      where: {
        targetType: WASTAGE_TARGET.ITEM,
        ...(scopeOutlet ? { outletId: scopeOutlet } : {}),
        createdAt: { gte: startOfLocalDay() },
      },
      select: {
        quantity: true,
        unitCost: true,
        itemId: true,
        item: { select: { name: true, brand: true } },
      },
    }),
  ]);

  const todayValue = todayRows.reduce(
    (sum, row) => sum + row.quantity * row.unitCost,
    0,
  );
  const itemTotals = new Map<string, { name: string; qty: number }>();
  for (const row of todayRows) {
    const name = row.item.brand
      ? `${row.item.brand} ${row.item.name}`
      : row.item.name;
    const existing = itemTotals.get(row.itemId) ?? { name, qty: 0 };
    existing.qty += row.quantity;
    itemTotals.set(row.itemId, existing);
  }
  let mostWasted: { name: string; qty: number } | null = null;
  for (const entry of itemTotals.values()) {
    if (!mostWasted || entry.qty > mostWasted.qty) mostWasted = entry;
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      quantity: row.quantity,
      unit: row.unit,
      unitCost: row.unitCost,
      value: Math.round(row.quantity * row.unitCost * 100) / 100,
      reason: row.reason as WastageReason,
      reasonLabel: WASTAGE_REASON_LABELS[row.reason as WastageReason] ?? row.reason,
      note: row.note,
      imageUrl: row.imageUrl,
      itemId: row.item.id,
      itemName: row.item.brand
        ? `${row.item.brand} ${row.item.name}`
        : row.item.name,
      itemSku: row.item.sku,
      outletId: row.outlet.id,
      outletName: row.outlet.name,
      recordedBy: row.user.name,
    })),
    summary: {
      todayValue: Math.round(todayValue * 100) / 100,
      todayCount: todayRows.length,
      mostWastedName: mostWasted?.name ?? null,
    },
  };
}

function emptySummary() {
  return { todayValue: 0, todayCount: 0, mostWastedName: null as string | null };
}

export type WastagePhotoSuggestion = {
  key: string;
  itemId: string;
  name: string;
  unit: string;
  /** Quantity the model counted in the photo. */
  detectedQuantity: number;
  /** Quantity suggested for wastage, capped to on-hand stock. */
  quantity: number;
  onHand: number;
  confidence: number;
  label: string;
  matchReason: string;
  canWaste: boolean;
};

/**
 * Analyse a wastage photo against one outlet's catalogue.
 * Does NOT change stock — the user must confirm suggestions first.
 */
export async function analyzeWastagePhoto(
  user: SessionUser,
  input: {
    outletId?: string | null;
    bytes: Uint8Array;
    mimeType: string;
    imageUrl: string;
  },
) {
  const requestedOutlet = String(input.outletId ?? "").trim();
  const outletId = isSuperAdmin(user) ? requestedOutlet : user.outletId;
  if (!outletId) {
    return { ok: false as const, error: "Choose which outlet this photo is for." };
  }
  if (
    !isSuperAdmin(user) &&
    requestedOutlet &&
    requestedOutlet !== user.outletId
  ) {
    return { ok: false as const, error: "You do not have access to that outlet." };
  }
  try {
    assertOutletAccess(user, outletId);
  } catch {
    return { ok: false as const, error: "You do not have access to that outlet." };
  }

  const catalogue = await getCatalogueForOutlet(outletId);
  const analysis = await analyseStockPhoto(
    input.bytes,
    input.mimeType || "image/jpeg",
    catalogue,
  );

  const candidates = catalogue.map((entry) => ({
    id: entry.id,
    sku: entry.sku,
    name: entry.name,
    brand: entry.brand,
    aliases: entry.aliases,
  }));
  const byId = new Map(catalogue.map((entry) => [entry.id, entry]));

  const merged = new Map<
    string,
    {
      itemId: string;
      detectedQuantity: number;
      confidence: number;
      label: string;
      matchReason: string;
    }
  >();
  const unmatched: { label: string; quantity: number; confidence: number }[] =
    [];

  for (const detected of analysis.items) {
    const match = matchDetectedItem(detected, candidates);
    if (!match) {
      unmatched.push({
        label: detected.label,
        quantity: detected.quantity,
        confidence: detected.confidence,
      });
      continue;
    }
    const existing = merged.get(match.itemId);
    if (existing) {
      existing.detectedQuantity += detected.quantity;
      existing.confidence = Math.max(existing.confidence, detected.confidence);
      existing.label = `${existing.label}; ${detected.label}`.slice(0, 200);
    } else {
      merged.set(match.itemId, {
        itemId: match.itemId,
        detectedQuantity: detected.quantity,
        confidence: detected.confidence,
        label: detected.label,
        matchReason: match.reason,
      });
    }
  }

  const suggestions: WastagePhotoSuggestion[] = [];
  for (const row of merged.values()) {
    const entry = byId.get(row.itemId);
    if (!entry) continue;
    const onHand = Math.round(entry.currentQty * 100) / 100;
    const detectedQuantity = Math.round(row.detectedQuantity * 100) / 100;
    const quantity = Math.min(detectedQuantity, onHand);
    suggestions.push({
      key: row.itemId,
      itemId: row.itemId,
      name: entry.brand ? `${entry.brand} ${entry.name}` : entry.name,
      unit: entry.unit,
      detectedQuantity,
      quantity,
      onHand,
      confidence: row.confidence,
      label: row.label,
      matchReason: row.matchReason,
      canWaste: onHand > 0 && quantity > 0,
    });
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);

  return {
    ok: true as const,
    imageUrl: input.imageUrl,
    provider: analysis.provider,
    simulated: !isAiConfigured(),
    detected: analysis.items.length,
    matched: suggestions.length,
    unmatched,
    suggestions,
  };
}

function startOfLocalDay() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDayStart(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDayEnd(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}
