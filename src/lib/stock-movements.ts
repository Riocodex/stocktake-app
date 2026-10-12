import "server-only";

import {
  assertOutletAccess,
  isSuperAdmin,
  type SessionUser,
} from "@/lib/auth";
import {
  STOCK_MOVEMENT_REFERENCE,
  STOCK_MOVEMENT_TYPE,
  STOCK_MOVEMENT_TYPE_LABELS,
  type StockMovementType,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatQty } from "@/lib/format";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type StockMovementWrite = {
  outletId: string;
  itemId: string;
  movementType: StockMovementType;
  quantityChange: number;
  unit: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  performedById?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  createdAt?: Date;
};

type MovementTx = {
  stockMovement: {
    create: typeof prisma.stockMovement.create;
    findUnique: typeof prisma.stockMovement.findUnique;
    createMany: typeof prisma.stockMovement.createMany;
  };
};

/** Write one movement inside an existing stock transaction. */
export async function createStockMovement(
  tx: MovementTx,
  input: StockMovementWrite,
) {
  const quantityChange = round2(input.quantityChange);
  if (quantityChange === 0) return null;

  const quantityBefore =
    input.quantityBefore === null || input.quantityBefore === undefined
      ? null
      : round2(input.quantityBefore);
  const quantityAfter =
    input.quantityAfter === null || input.quantityAfter === undefined
      ? null
      : round2(input.quantityAfter);

  if (
    quantityBefore !== null &&
    quantityAfter !== null &&
    round2(quantityBefore + quantityChange) !== quantityAfter
  ) {
    throw new Error(
      `Stock movement invariant failed (${formatQty(quantityBefore)} + ${formatQty(quantityChange)} ≠ ${formatQty(quantityAfter)}).`,
    );
  }

  return tx.stockMovement.create({
    data: {
      outletId: input.outletId,
      itemId: input.itemId,
      movementType: input.movementType,
      quantityChange,
      unit: input.unit,
      quantityBefore,
      quantityAfter,
      performedById: input.performedById ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
}

export function movementHref(row: {
  movementType: string;
  referenceType: string | null;
  referenceId: string | null;
  transferId?: string | null;
  stockTakeId?: string | null;
}) {
  const type = row.referenceType;
  const id = row.referenceId;
  if (!type || !id) return null;

  if (
    row.movementType === STOCK_MOVEMENT_TYPE.WASTAGE ||
    type === STOCK_MOVEMENT_REFERENCE.WASTAGE
  ) {
    return `/app/inventory/wastage`;
  }
  if (
    type === STOCK_MOVEMENT_REFERENCE.TRANSFER ||
    type === STOCK_MOVEMENT_REFERENCE.TRANSFER_LINE
  ) {
    return row.transferId
      ? `/app/inventory/transfers/${row.transferId}`
      : `/app/inventory/transfers`;
  }
  if (
    type === STOCK_MOVEMENT_REFERENCE.STOCK_TAKE ||
    type === STOCK_MOVEMENT_REFERENCE.STOCK_TAKE_LINE
  ) {
    return row.stockTakeId
      ? `/app/stock-takes/${row.stockTakeId}`
      : `/app/stock-takes`;
  }
  if (
    type === STOCK_MOVEMENT_REFERENCE.DELIVERY ||
    type === STOCK_MOVEMENT_REFERENCE.DELIVERY_LINE
  ) {
    return `/app/inventory/delivery`;
  }
  return null;
}

export async function listStockMovements(
  user: SessionUser,
  filters: {
    outletId?: string | null;
    itemId?: string | null;
    movementType?: string | null;
    from?: string | null;
    to?: string | null;
    take?: number;
  } = {},
) {
  const scope = isSuperAdmin(user)
    ? filters.outletId && filters.outletId !== "all"
      ? filters.outletId
      : null
    : user.outletId;

  if (!isSuperAdmin(user)) {
    if (!scope) return [];
    try {
      assertOutletAccess(user, scope);
    } catch {
      return [];
    }
  } else if (scope) {
    try {
      assertOutletAccess(user, scope);
    } catch {
      return [];
    }
  }

  const from = parseDayStart(filters.from);
  const to = parseDayEnd(filters.to);
  const movementType = String(filters.movementType ?? "").trim();
  const itemId = String(filters.itemId ?? "").trim();

  const rows = await prisma.stockMovement.findMany({
    where: {
      ...(scope ? { outletId: scope } : {}),
      ...(itemId ? { itemId } : {}),
      ...(movementType && isMovementType(movementType)
        ? { movementType }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      outlet: { select: { id: true, name: true } },
      item: {
        select: { id: true, name: true, brand: true, sku: true, unit: true },
      },
      performedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters.take ?? 200,
  });

  // Resolve transfer / stock-take parents for deep links when refs are lines.
  const transferLineIds = rows
    .filter((row) => row.referenceType === STOCK_MOVEMENT_REFERENCE.TRANSFER_LINE)
    .map((row) => row.referenceId!)
    .filter(Boolean);
  const stockTakeLineIds = rows
    .filter(
      (row) => row.referenceType === STOCK_MOVEMENT_REFERENCE.STOCK_TAKE_LINE,
    )
    .map((row) => row.referenceId!)
    .filter(Boolean);

  const [transferLines, stockTakeLines] = await Promise.all([
    transferLineIds.length
      ? prisma.transferLine.findMany({
          where: { id: { in: transferLineIds } },
          select: { id: true, transferId: true },
        })
      : Promise.resolve([]),
    stockTakeLineIds.length
      ? prisma.stockTakeLine.findMany({
          where: { id: { in: stockTakeLineIds } },
          select: { id: true, stockTakeId: true },
        })
      : Promise.resolve([]),
  ]);

  const transferByLine = new Map(
    transferLines.map((line) => [line.id, line.transferId]),
  );
  const takeByLine = new Map(
    stockTakeLines.map((line) => [line.id, line.stockTakeId]),
  );

  return rows.map((row) => {
    const transferId =
      row.referenceType === STOCK_MOVEMENT_REFERENCE.TRANSFER
        ? row.referenceId
        : row.referenceType === STOCK_MOVEMENT_REFERENCE.TRANSFER_LINE
          ? (transferByLine.get(row.referenceId ?? "") ?? null)
          : null;
    const stockTakeId =
      row.referenceType === STOCK_MOVEMENT_REFERENCE.STOCK_TAKE
        ? row.referenceId
        : row.referenceType === STOCK_MOVEMENT_REFERENCE.STOCK_TAKE_LINE
          ? (takeByLine.get(row.referenceId ?? "") ?? null)
          : null;

    return {
      id: row.id,
      outletId: row.outletId,
      outletName: row.outlet.name,
      itemId: row.itemId,
      itemName: row.item.brand
        ? `${row.item.brand} ${row.item.name}`
        : row.item.name,
      sku: row.item.sku,
      movementType: row.movementType as StockMovementType,
      movementTypeLabel:
        STOCK_MOVEMENT_TYPE_LABELS[row.movementType as StockMovementType] ??
        row.movementType,
      quantityChange: row.quantityChange,
      unit: row.unit,
      quantityBefore: row.quantityBefore,
      quantityAfter: row.quantityAfter,
      balancesVerified:
        row.quantityBefore !== null && row.quantityAfter !== null,
      performedById: row.performedById,
      performedBy: row.performedBy?.name ?? null,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      note: row.note,
      createdAt: row.createdAt,
      href: movementHref({
        movementType: row.movementType,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        transferId,
        stockTakeId,
      }),
    };
  });
}

function isMovementType(value: string): value is StockMovementType {
  return Object.values(STOCK_MOVEMENT_TYPE).includes(value as StockMovementType);
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

