import {
  STOCK_MOVEMENT_REFERENCE,
  STOCK_MOVEMENT_TYPE,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { createStockMovement } from "@/lib/stock-movements";

export type DeliveryLineInput = {
  itemId: string;
  /** Quantity already expressed in the InventoryItem stock unit. */
  quantity: number;
  unitPrice?: number | null;
  expiryDate?: Date | null;
  invoiceLineId?: string | null;
};

export type CreateDeliveryInput = {
  outletId: string;
  userId: string;
  supplierId?: string | null;
  invoiceId?: string | null;
  reference?: string | null;
  note?: string | null;
  /** When true, create the Delivery link only — do not change OutletStock. */
  linkedWithoutStock?: boolean;
  lines: DeliveryLineInput[];
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Canonical receiving write path. All stock increases from deliveries go here.
 * Call inside an outer transaction when composing with invoice progress updates.
 */
export async function createDeliveryReceiving(
  tx: Tx,
  input: CreateDeliveryInput,
) {
  if (input.lines.length === 0) {
    throw new Error("Add at least one product from the delivery.");
  }

  for (const line of input.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("Each line needs a quantity greater than zero.");
    }
  }

  const created = await tx.delivery.create({
    data: {
      outletId: input.outletId,
      userId: input.userId,
      supplierId: input.supplierId ?? null,
      invoiceId: input.invoiceId ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      linkedWithoutStock: Boolean(input.linkedWithoutStock),
      lines: {
        create: input.lines.map((line) => ({
          itemId: line.itemId,
          quantity: Math.round(line.quantity * 100) / 100,
          unitPrice: line.unitPrice ?? null,
          expiryDate: line.expiryDate ?? null,
          invoiceLineId: line.invoiceLineId ?? null,
        })),
      },
    },
    include: {
      lines: {
        include: { item: { select: { unit: true, referencePrice: true } } },
      },
    },
  });

  if (!input.linkedWithoutStock) {
    for (const line of created.lines) {
      await tx.outletStock.upsert({
        where: {
          outletId_itemId: {
            outletId: input.outletId,
            itemId: line.itemId,
          },
        },
        create: {
          outletId: input.outletId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.item.referencePrice ?? 0,
          expiryDate: line.expiryDate,
        },
        update: {
          quantity: { increment: line.quantity },
          ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
        },
      });

      const fresh = await tx.outletStock.findUniqueOrThrow({
        where: {
          outletId_itemId: {
            outletId: input.outletId,
            itemId: line.itemId,
          },
        },
        select: { quantity: true },
      });
      const quantityAfter = Math.round(fresh.quantity * 100) / 100;
      const quantityBefore =
        Math.round((quantityAfter - line.quantity) * 100) / 100;

      await createStockMovement(tx, {
        outletId: input.outletId,
        itemId: line.itemId,
        movementType: STOCK_MOVEMENT_TYPE.DELIVERY,
        quantityChange: line.quantity,
        unit: line.item.unit,
        quantityBefore,
        quantityAfter,
        performedById: input.userId,
        referenceType: STOCK_MOVEMENT_REFERENCE.DELIVERY_LINE,
        referenceId: line.id,
        note: input.note ?? null,
      });
    }
  }

  await tx.activityLog.create({
    data: {
      userId: input.userId,
      outletId: input.outletId,
      action: input.linkedWithoutStock
        ? "DELIVERY_LINKED_TO_INVOICE"
        : "DELIVERY_RECORDED",
      detail: input.linkedWithoutStock
        ? `${created.lines.length} line(s) linked to invoice (no stock change)`
        : `${created.lines.length} line${created.lines.length === 1 ? "" : "s"} received`,
    },
  });

  return created;
}
