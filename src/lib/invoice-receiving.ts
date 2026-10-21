import {
  INVOICE_LINE_MATCH,
  INVOICE_RECEIVE_QTY_TOLERANCE,
  INVOICE_RECEIVING_STATUS,
  INVOICE_STATUS,
  ROLES,
  type InvoiceReceivingStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { createDeliveryReceiving } from "@/lib/deliveries";
import { InvoiceError, type InvoiceActor } from "@/lib/invoices";
import { toStockQuantity } from "@/lib/units";

function isSuper(user: InvoiceActor) {
  return user.role === ROLES.SUPER_ADMIN;
}

function assertOutletAccess(user: InvoiceActor, outletId: string) {
  if (isSuper(user)) return;
  if (user.outletId !== outletId) {
    throw new InvoiceError(403, "You do not have access to this outlet.");
  }
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function computeInvoiceReceivingStatus(
  lines: Array<{
    excludeFromReceiving: boolean;
    itemId: string | null;
    invoicedStockQty: number | null;
    quantityReceived: number;
  }>,
): InvoiceReceivingStatus {
  const receivable = lines.filter(
    (line) =>
      !line.excludeFromReceiving &&
      line.itemId &&
      line.invoicedStockQty !== null &&
      line.invoicedStockQty > 0,
  );
  if (receivable.length === 0) return INVOICE_RECEIVING_STATUS.NOT_RECEIVED;

  let anyReceived = false;
  let allFull = true;
  for (const line of receivable) {
    const received = line.quantityReceived;
    const invoiced = line.invoicedStockQty!;
    if (received > INVOICE_RECEIVE_QTY_TOLERANCE) anyReceived = true;
    if (received + INVOICE_RECEIVE_QTY_TOLERANCE < invoiced) allFull = false;
  }

  if (!anyReceived) return INVOICE_RECEIVING_STATUS.NOT_RECEIVED;
  if (allFull) return INVOICE_RECEIVING_STATUS.FULLY_RECEIVED;
  return INVOICE_RECEIVING_STATUS.PARTIALLY_RECEIVED;
}

export type ReceivableLinePreview = {
  invoiceLineId: string;
  rawDescription: string;
  itemId: string | null;
  itemName: string | null;
  stockUnit: string | null;
  supplierPackQty: number | null;
  invoiceQuantity: number | null;
  invoiceUnit: string | null;
  invoicedStockQty: number | null;
  quantityReceived: number;
  remainingStockQty: number | null;
  conversionError: string | null;
  excludeFromReceiving: boolean;
  matchStatus: string;
  canReceive: boolean;
  unitPrice: number | null;
};

function lineInvoicedStockQty(line: {
  quantity: number | null;
  unit: string | null;
  item: { unit: string; supplierPackQty: number | null } | null;
}): { qty: number | null; error: string | null } {
  if (!line.item || line.quantity === null || line.quantity <= 0) {
    return { qty: null, error: "Missing quantity or matched item." };
  }
  const fromUnit = line.unit?.trim() || line.item.unit;
  const conversion = toStockQuantity(
    line.quantity,
    fromUnit,
    line.item.unit,
    { unitsPerStockUnit: line.item.supplierPackQty },
  );
  if (!conversion.ok) {
    return { qty: null, error: conversion.error };
  }
  return { qty: conversion.quantity, error: null };
}

export async function getInvoiceReceivingPreview(
  user: InvoiceActor,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      outlet: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              unit: true,
              supplierPackQty: true,
              sku: true,
            },
          },
        },
      },
      deliveries: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          lines: {
            include: { item: { select: { id: true, name: true, unit: true } } },
          },
        },
      },
    },
  });

  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);

  const lines: ReceivableLinePreview[] = invoice.lines.map((line) => {
    const converted = lineInvoicedStockQty(line);
    const received = roundQty(line.quantityReceived);
    const remaining =
      converted.qty === null
        ? null
        : Math.max(0, roundQty(converted.qty - received));
    const matched = Boolean(line.itemId);
    const documentReady =
      invoice.status === INVOICE_STATUS.CONFIRMED ||
      invoice.status === INVOICE_STATUS.EXTRACTED ||
      invoice.status === INVOICE_STATUS.NEEDS_REVIEW;
    const canReceive =
      documentReady &&
      !line.excludeFromReceiving &&
      matched &&
      converted.qty !== null &&
      converted.error === null &&
      (remaining ?? 0) > INVOICE_RECEIVE_QTY_TOLERANCE;

    return {
      invoiceLineId: line.id,
      rawDescription: line.rawDescription,
      itemId: line.itemId,
      itemName: line.item?.name ?? null,
      stockUnit: line.item?.unit ?? null,
      supplierPackQty: line.item?.supplierPackQty ?? null,
      invoiceQuantity: line.quantity,
      invoiceUnit: line.unit,
      invoicedStockQty: converted.qty,
      quantityReceived: received,
      remainingStockQty: remaining,
      conversionError: converted.error,
      excludeFromReceiving: line.excludeFromReceiving,
      matchStatus: line.matchStatus,
      canReceive,
      unitPrice: line.unitPrice,
    };
  });

  const receivingStatus = computeInvoiceReceivingStatus(
    lines.map((line) => ({
      excludeFromReceiving: line.excludeFromReceiving,
      itemId: line.itemId,
      invoicedStockQty: line.invoicedStockQty,
      quantityReceived: line.quantityReceived,
    })),
  );

  const suspected = await findSuspectedManualDeliveries(invoice);

  return {
    invoice: {
      id: invoice.id,
      status: invoice.status,
      receivingStatus: invoice.receivingStatus as InvoiceReceivingStatus,
      outletId: invoice.outletId,
      outletName: invoice.outlet.name,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier?.name ?? invoice.supplierTextRaw,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
    },
    computedReceivingStatus: receivingStatus,
    lines,
    linkedDeliveries: invoice.deliveries,
    suspectedManualDeliveries: suspected,
  };
}

async function findSuspectedManualDeliveries(invoice: {
  id: string;
  outletId: string;
  supplierId: string | null;
  invoiceDate: Date | null;
  lines: Array<{ itemId: string | null }>;
}) {
  const itemIds = [
    ...new Set(
      invoice.lines.map((l) => l.itemId).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (itemIds.length === 0) return [];

  const from = invoice.invoiceDate
    ? new Date(invoice.invoiceDate.getTime() - 3 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = invoice.invoiceDate
    ? new Date(invoice.invoiceDate.getTime() + 3 * 24 * 60 * 60 * 1000)
    : new Date();

  const candidates = await prisma.delivery.findMany({
    where: {
      outletId: invoice.outletId,
      invoiceId: null,
      linkedWithoutStock: false,
      createdAt: { gte: from, lte: to },
      ...(invoice.supplierId ? { supplierId: invoice.supplierId } : {}),
      lines: { some: { itemId: { in: itemIds } } },
    },
    include: {
      lines: { select: { itemId: true, quantity: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return candidates.map((delivery) => ({
    id: delivery.id,
    createdAt: delivery.createdAt,
    userName: delivery.user.name,
    reference: delivery.reference,
    note: delivery.note,
    overlappingItems: delivery.lines.filter((l) => itemIds.includes(l.itemId))
      .length,
    risk:
      "This unlinked delivery may already include goods from this invoice. Link it instead of receiving again, or review carefully.",
  }));
}

export type ReceiveLineInput = {
  invoiceLineId: string;
  /** Actual quantity received this time, in the invoice line unit (or stock unit if convertAsStock). */
  quantity: number;
  /** When true, `quantity` is already in the item stock unit. */
  quantityInStockUnit?: boolean;
  exclude?: boolean;
};

/**
 * One-step TRiBE goods-receipt workflow:
 * save/confirm the invoice document AND receive stock in one atomic action.
 * Upload/extract alone never changes stock — only this confirmation does.
 */
export async function confirmDeliveryAndUpdateStock(
  user: InvoiceActor,
  invoiceId: string,
  input: {
    lines: ReceiveLineInput[];
    note?: string | null;
    allowOverReceipt?: boolean;
    overReceiptReason?: string | null;
    acknowledgeSuspectedDuplicates?: boolean;
    acknowledgeDocumentDuplicates?: boolean;
  },
) {
  return receiveGoodsFromInvoice(user, invoiceId, {
    ...input,
    confirmDocument: true,
  });
}

/**
 * Receive stock against an invoice.
 * With `confirmDocument: true` (one-step), also marks the invoice CONFIRMED
 * in the same transaction. Without it, the invoice must already be CONFIRMED
 * (legacy “Receive existing invoice” path).
 */
export async function receiveGoodsFromInvoice(
  user: InvoiceActor,
  invoiceId: string,
  input: {
    lines: ReceiveLineInput[];
    note?: string | null;
    allowOverReceipt?: boolean;
    overReceiptReason?: string | null;
    acknowledgeSuspectedDuplicates?: boolean;
    acknowledgeDocumentDuplicates?: boolean;
    /** When true, confirm document + receive stock together (one-step). */
    confirmDocument?: boolean;
  },
) {
  const preview = await getInvoiceReceivingPreview(user, invoiceId);
  const oneStep = Boolean(input.confirmDocument);

  if (preview.invoice.receivingStatus === INVOICE_RECEIVING_STATUS.FULLY_RECEIVED) {
    throw new InvoiceError(
      400,
      "This invoice has already been fully received. Stock will not be increased again.",
    );
  }

  if (oneStep) {
    if (
      preview.invoice.status !== INVOICE_STATUS.EXTRACTED &&
      preview.invoice.status !== INVOICE_STATUS.NEEDS_REVIEW &&
      preview.invoice.status !== INVOICE_STATUS.CONFIRMED
    ) {
      throw new InvoiceError(
        400,
        "Finish extraction and review before confirming delivery.",
      );
    }
  } else if (preview.invoice.status !== INVOICE_STATUS.CONFIRMED) {
    throw new InvoiceError(
      400,
      "This invoice is not confirmed yet. Use Confirm Delivery & Update Stock on the review screen.",
    );
  }

  // Document-level duplicate (re-upload of same invoice number).
  if (oneStep && preview.invoice.status !== INVOICE_STATUS.CONFIRMED) {
    const { duplicates } = await import("@/lib/invoices").then((m) =>
      m.getInvoice(user, invoiceId),
    );
    if (duplicates.length > 0 && !input.acknowledgeDocumentDuplicates) {
      throw new InvoiceError(
        409,
        `Likely duplicate invoice ${duplicates[0]?.invoiceNumber ?? duplicates[0]?.id}. Acknowledge to continue.`,
      );
    }
  }

  if (
    preview.suspectedManualDeliveries.length > 0 &&
    !input.acknowledgeSuspectedDuplicates
  ) {
    throw new InvoiceError(
      409,
      "Possible duplicate manual delivery found. Link that delivery or acknowledge the risk before updating stock.",
    );
  }

  const byId = new Map(preview.lines.map((l) => [l.invoiceLineId, l]));
  const toReceive: Array<{
    invoiceLineId: string;
    itemId: string;
    stockQty: number;
    unitPrice: number | null;
    newReceivedTotal: number;
  }> = [];

  // Apply exclusions first (no stock)
  const excludeIds = input.lines
    .filter((l) => l.exclude)
    .map((l) => l.invoiceLineId);

  for (const req of input.lines) {
    if (req.exclude) continue;
    if (!Number.isFinite(req.quantity) || req.quantity <= 0) continue;

    const line = byId.get(req.invoiceLineId);
    if (!line) {
      throw new InvoiceError(400, "Unknown invoice line.");
    }
    if (line.excludeFromReceiving) {
      throw new InvoiceError(
        400,
        `"${line.rawDescription}" is excluded from inventory receiving.`,
      );
    }
    if (!line.itemId || !line.stockUnit) {
      throw new InvoiceError(
        400,
        `Unmatched line cannot be received: ${line.rawDescription}`,
      );
    }
    if (line.conversionError || line.invoicedStockQty === null) {
      throw new InvoiceError(
        400,
        line.conversionError ??
          `Cannot convert units for ${line.rawDescription}`,
      );
    }

    let stockQty: number;
    if (req.quantityInStockUnit) {
      stockQty = roundQty(req.quantity);
    } else {
      const fromUnit = line.invoiceUnit?.trim() || line.stockUnit;
      const conversion = toStockQuantity(req.quantity, fromUnit, line.stockUnit, {
        unitsPerStockUnit: line.supplierPackQty,
      });
      if (!conversion.ok) {
        throw new InvoiceError(400, conversion.error);
      }
      stockQty = conversion.quantity;
    }

    const remaining = line.remainingStockQty ?? 0;
    if (
      stockQty > remaining + INVOICE_RECEIVE_QTY_TOLERANCE &&
      !input.allowOverReceipt
    ) {
      throw new InvoiceError(
        400,
        `Cannot receive more than remaining for "${line.rawDescription}" (${remaining} ${line.stockUnit} left). Enable over-receipt with a reason if intentional.`,
      );
    }
    if (
      stockQty > remaining + INVOICE_RECEIVE_QTY_TOLERANCE &&
      input.allowOverReceipt &&
      !String(input.overReceiptReason ?? "").trim()
    ) {
      throw new InvoiceError(
        400,
        "Over-receipt requires an audited reason.",
      );
    }

    toReceive.push({
      invoiceLineId: line.invoiceLineId,
      itemId: line.itemId,
      stockQty,
      unitPrice: line.unitPrice,
      newReceivedTotal: roundQty(line.quantityReceived + stockQty),
    });
  }

  if (toReceive.length === 0 && excludeIds.length === 0) {
    throw new InvoiceError(400, "Enter at least one received quantity.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Lock invoice row: refuse if already fully received (idempotency).
    const locked = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    assertOutletAccess(user, locked.outletId);
    if (locked.receivingStatus === INVOICE_RECEIVING_STATUS.FULLY_RECEIVED) {
      throw new InvoiceError(
        409,
        "This invoice was already fully received (concurrent request blocked).",
      );
    }

    if (oneStep && locked.status !== INVOICE_STATUS.CONFIRMED) {
      if (!locked.currency) {
        throw new InvoiceError(400, "Currency is required.");
      }
      if (locked.total === null) {
        throw new InvoiceError(400, "Enter an invoice total before confirming.");
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: INVOICE_STATUS.CONFIRMED,
          reviewedById: user.id,
          confirmedAt: new Date(),
        },
      });
      await tx.activityLog.create({
        data: {
          userId: user.id,
          outletId: locked.outletId,
          action: "INVOICE_CONFIRMED",
          detail: `${locked.invoiceNumber ?? locked.id} · confirmed with delivery`,
        },
      });
    } else if (!oneStep && locked.status !== INVOICE_STATUS.CONFIRMED) {
      throw new InvoiceError(400, "Invoice is no longer confirmed.");
    }

    // Re-read lines inside the transaction to prevent concurrent double-receive.
    for (const row of toReceive) {
      const fresh = await tx.invoiceLine.findUniqueOrThrow({
        where: { id: row.invoiceLineId },
        include: {
          item: { select: { unit: true, supplierPackQty: true } },
          invoice: { select: { status: true, outletId: true } },
        },
      });
      assertOutletAccess(user, fresh.invoice.outletId);

      const converted = lineInvoicedStockQty(fresh);
      if (converted.qty === null) {
        throw new InvoiceError(400, converted.error ?? "Conversion failed.");
      }
      const remaining = roundQty(converted.qty - fresh.quantityReceived);
      if (
        row.stockQty > remaining + INVOICE_RECEIVE_QTY_TOLERANCE &&
        !input.allowOverReceipt
      ) {
        throw new InvoiceError(
          409,
          `Concurrent update: remaining quantity for a line changed. Refresh and try again.`,
        );
      }
    }

    for (const id of excludeIds) {
      await tx.invoiceLine.update({
        where: { id },
        data: { excludeFromReceiving: true },
      });
    }

    let delivery = null;
    if (toReceive.length > 0) {
      const noteParts = [
        input.note?.trim() || null,
        input.allowOverReceipt
          ? `Over-receipt: ${input.overReceiptReason?.trim()}`
          : null,
      ].filter(Boolean);

      delivery = await createDeliveryReceiving(tx, {
        outletId: preview.invoice.outletId,
        userId: user.id,
        supplierId: preview.invoice.supplierId,
        invoiceId,
        reference: preview.invoice.invoiceNumber,
        note:
          noteParts.join(" · ") ||
          (oneStep
            ? `Confirm delivery & update stock · ${invoiceId}`
            : `Received from invoice ${invoiceId}`),
        lines: toReceive.map((row) => ({
          itemId: row.itemId,
          quantity: row.stockQty,
          unitPrice: row.unitPrice,
          invoiceLineId: row.invoiceLineId,
        })),
      });

      for (const row of toReceive) {
        await tx.invoiceLine.update({
          where: { id: row.invoiceLineId },
          data: { quantityReceived: row.newReceivedTotal },
        });
      }
    }

    const allLines = await tx.invoiceLine.findMany({
      where: { invoiceId },
      include: {
        item: { select: { unit: true, supplierPackQty: true } },
      },
    });

    const status = computeInvoiceReceivingStatus(
      allLines.map((line) => {
        const converted = lineInvoicedStockQty(line);
        return {
          excludeFromReceiving: line.excludeFromReceiving,
          itemId: line.itemId,
          invoicedStockQty: converted.qty,
          quantityReceived: line.quantityReceived,
        };
      }),
    );

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { receivingStatus: status },
    });

    await tx.activityLog.create({
      data: {
        userId: user.id,
        outletId: preview.invoice.outletId,
        action: oneStep
          ? "INVOICE_DELIVERY_CONFIRMED"
          : "INVOICE_GOODS_RECEIVED",
        detail: `${toReceive.length} line(s) · status ${status}${
          input.allowOverReceipt ? " · over-receipt" : ""
        }`,
      },
    });

    return { delivery, receivingStatus: status };
  });

  return {
    ...result,
    stockChanged: toReceive.length > 0,
    pricesChanged: false,
    invoiceStatus: INVOICE_STATUS.CONFIRMED,
    oneStep,
  };
}

/**
 * Mark invoice as already received without changing stock
 * (e.g. goods were booked via manual Delivery already).
 */
export async function markInvoiceReceivedWithoutStock(
  user: InvoiceActor,
  invoiceId: string,
  reason: string,
) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);
  if (!String(reason ?? "").trim()) {
    throw new InvoiceError(400, "Provide a reason for marking as received.");
  }

  await prisma.$transaction(async (tx) => {
    if (invoice.status !== INVOICE_STATUS.CONFIRMED) {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: INVOICE_STATUS.CONFIRMED,
          reviewedById: user.id,
          confirmedAt: new Date(),
        },
      });
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { receivingStatus: INVOICE_RECEIVING_STATUS.FULLY_RECEIVED },
    });
    await tx.activityLog.create({
      data: {
        userId: user.id,
        outletId: invoice.outletId,
        action: "INVOICE_MARKED_RECEIVED_NO_STOCK",
        detail: reason.trim().slice(0, 400),
      },
    });
  });

  return { stockChanged: false as const };
}

/**
 * Link an existing manual delivery to this invoice without changing stock.
 */
export async function linkManualDeliveryToInvoice(
  user: InvoiceActor,
  invoiceId: string,
  deliveryId: string,
  mappings: Array<{ deliveryLineId: string; invoiceLineId: string }>,
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: {
        include: { item: { select: { unit: true, supplierPackQty: true } } },
      },
    },
  });
  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);
  if (invoice.status !== INVOICE_STATUS.CONFIRMED) {
    throw new InvoiceError(400, "Invoice must be confirmed first.");
  }

  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { lines: true },
  });
  if (!delivery) throw new InvoiceError(404, "Delivery not found.");
  assertOutletAccess(user, delivery.outletId);
  if (delivery.outletId !== invoice.outletId) {
    throw new InvoiceError(400, "Delivery and invoice must share an outlet.");
  }
  if (delivery.invoiceId && delivery.invoiceId !== invoiceId) {
    throw new InvoiceError(400, "Delivery is already linked to another invoice.");
  }

  const invoiceLineById = new Map(invoice.lines.map((l) => [l.id, l]));
  const deliveryLineById = new Map(delivery.lines.map((l) => [l.id, l]));

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        invoiceId,
        linkedWithoutStock: true,
        supplierId: delivery.supplierId ?? invoice.supplierId,
      },
    });

    for (const map of mappings) {
      const dLine = deliveryLineById.get(map.deliveryLineId);
      const iLine = invoiceLineById.get(map.invoiceLineId);
      if (!dLine || !iLine) {
        throw new InvoiceError(400, "Invalid line mapping.");
      }
      if (!iLine.itemId || iLine.itemId !== dLine.itemId) {
        throw new InvoiceError(
          400,
          "Mapped lines must refer to the same inventory item.",
        );
      }

      await tx.deliveryLine.update({
        where: { id: dLine.id },
        data: { invoiceLineId: iLine.id },
      });

      const nextReceived = roundQty(iLine.quantityReceived + dLine.quantity);
      await tx.invoiceLine.update({
        where: { id: iLine.id },
        data: { quantityReceived: nextReceived },
      });
      // Keep local map in sync for multi-line same invoice line (rare).
      iLine.quantityReceived = nextReceived;
    }

    const allLines = await tx.invoiceLine.findMany({
      where: { invoiceId },
      include: { item: { select: { unit: true, supplierPackQty: true } } },
    });
    const status = computeInvoiceReceivingStatus(
      allLines.map((line) => {
        const converted = lineInvoicedStockQty(line);
        return {
          excludeFromReceiving: line.excludeFromReceiving,
          itemId: line.itemId,
          invoicedStockQty: converted.qty,
          quantityReceived: line.quantityReceived,
        };
      }),
    );
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { receivingStatus: status },
    });

    await tx.activityLog.create({
      data: {
        userId: user.id,
        outletId: invoice.outletId,
        action: "INVOICE_DELIVERY_LINKED",
        detail: `Linked delivery ${deliveryId} without stock increment · ${status}`,
      },
    });
  });

  return { stockChanged: false, linked: true };
}

export async function setInvoiceLineReceivingFlags(
  user: InvoiceActor,
  invoiceId: string,
  updates: Array<{
    invoiceLineId: string;
    itemId?: string | null;
    excludeFromReceiving?: boolean;
  }>,
) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const data: {
        itemId?: string | null;
        matchStatus?: string;
        excludeFromReceiving?: boolean;
      } = {};
      if (update.itemId !== undefined) {
        data.itemId = update.itemId || null;
        data.matchStatus = update.itemId
          ? INVOICE_LINE_MATCH.MATCHED
          : INVOICE_LINE_MATCH.UNMATCHED;
      }
      if (update.excludeFromReceiving !== undefined) {
        data.excludeFromReceiving = update.excludeFromReceiving;
      }
      await tx.invoiceLine.update({
        where: { id: update.invoiceLineId },
        data,
      });
    }
  });

  return getInvoiceReceivingPreview(user, invoiceId);
}
