import "server-only";

import {
  assertOutletAccess,
  isSuperAdmin,
  type SessionUser,
} from "@/lib/auth";
import { analyseStockPhoto, isAiConfigured } from "@/lib/ai";
import {
  TRANSFER_STATUS,
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatQty } from "@/lib/format";
import { matchDetectedItem } from "@/lib/matching";
import { getCatalogueForOutlet } from "@/lib/stock";

export type TransferLineInput = {
  itemId: string;
  quantity: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function nextTransferReference(
  tx: {
    transfer: {
      findFirst: typeof prisma.transfer.findFirst;
    };
  } = prisma,
) {
  const year = new Date().getFullYear();
  const prefix = `TR-${year}-`;
  const latest = await tx.transfer.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const sequence = latest
    ? Number.parseInt(latest.reference.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

function resolveSourceOutlet(user: SessionUser, requested: string | null | undefined) {
  const requestedOutlet = String(requested ?? "").trim();
  const outletId = isSuperAdmin(user) ? requestedOutlet : user.outletId;
  if (!outletId) return { error: "Choose which outlet is sending stock." as const };
  if (
    !isSuperAdmin(user) &&
    requestedOutlet &&
    requestedOutlet !== user.outletId
  ) {
    return { error: "You do not have access to that outlet." as const };
  }
  try {
    assertOutletAccess(user, outletId);
  } catch {
    return { error: "You do not have access to that outlet." as const };
  }
  return { outletId };
}

function canViewTransfer(
  user: SessionUser,
  fromOutletId: string,
  toOutletId: string,
) {
  if (isSuperAdmin(user)) return true;
  return user.outletId === fromOutletId || user.outletId === toOutletId;
}

const transferInclude = {
  fromOutlet: { select: { id: true, name: true } },
  toOutlet: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  sentBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      item: {
        select: { id: true, name: true, brand: true, sku: true, unit: true },
      },
    },
    orderBy: { item: { name: "asc" as const } },
  },
} as const;

function serializeTransfer(
  row: Awaited<ReturnType<typeof prisma.transfer.findFirstOrThrow>> & {
    fromOutlet: { id: string; name: string };
    toOutlet: { id: string; name: string };
    createdBy: { id: string; name: string };
    sentBy: { id: string; name: string } | null;
    receivedBy: { id: string; name: string } | null;
    lines: {
      id: string;
      itemId: string;
      unit: string;
      sentQty: number;
      receivedQty: number | null;
      discrepancyNote: string | null;
      item: {
        id: string;
        name: string;
        brand: string | null;
        sku: string;
        unit: string;
      };
    }[];
  },
) {
  const lines = row.lines.map((line) => {
    const name = line.item.brand
      ? `${line.item.brand} ${line.item.name}`
      : line.item.name;
    return {
      id: line.id,
      itemId: line.itemId,
      name,
      sku: line.item.sku,
      unit: line.unit,
      sentQty: line.sentQty,
      receivedQty: line.receivedQty,
      discrepancy:
        line.receivedQty === null
          ? null
          : round2(line.receivedQty - line.sentQty),
      discrepancyNote: line.discrepancyNote,
    };
  });

  const preview = lines.slice(0, 4).map((line) => {
    const qtyShown =
      line.receivedQty !== null ? line.receivedQty : line.sentQty;
    const suffix =
      line.receivedQty !== null &&
      round2(line.receivedQty) !== round2(line.sentQty)
        ? ` (sent ${formatQty(line.sentQty)})`
        : "";
    return `${formatQty(qtyShown)} ${line.unit} ${line.name}${suffix}`;
  });

  return {
    id: row.id,
    reference: row.reference,
    status: row.status as TransferStatus,
    statusLabel:
      TRANSFER_STATUS_LABELS[row.status as TransferStatus] ?? row.status,
    note: row.note,
    imageUrl: row.imageUrl ?? null,
    fromOutletId: row.fromOutletId,
    fromOutletName: row.fromOutlet.name,
    toOutletId: row.toOutletId,
    toOutletName: row.toOutlet.name,
    createdBy: row.createdBy.name,
    sentBy: row.sentBy?.name ?? null,
    receivedBy: row.receivedBy?.name ?? null,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    receivedAt: row.receivedAt,
    cancelledAt: row.cancelledAt,
    lineCount: lines.length,
    hasDiscrepancy: lines.some(
      (line) =>
        line.receivedQty !== null &&
        round2(line.receivedQty) !== round2(line.sentQty),
    ),
    lineSummary: preview,
    lineSummaryExtra: Math.max(0, lines.length - preview.length),
    lines,
  };
}

export async function listTransfers(
  user: SessionUser,
  filters: {
    outletId?: string | null;
    direction?: "all" | "incoming" | "outgoing" | "drafts" | null;
    status?: string | null;
    take?: number;
  } = {},
) {
  const scope = isSuperAdmin(user)
    ? filters.outletId && filters.outletId !== "all"
      ? filters.outletId
      : null
    : user.outletId;

  if (!isSuperAdmin(user) && !scope) return [];

  const direction = filters.direction ?? "all";
  const status = filters.status?.trim() || null;

  let finalWhere: Record<string, unknown> = {};
  if (direction === "drafts") {
    finalWhere = {
      status: TRANSFER_STATUS.DRAFT,
      ...(scope
        ? { OR: [{ fromOutletId: scope }, { toOutletId: scope }] }
        : {}),
    };
  } else if (direction === "incoming") {
    finalWhere = {
      ...(status ? { status } : { status: { not: TRANSFER_STATUS.CANCELLED } }),
      ...(scope
        ? { toOutletId: scope }
        : isSuperAdmin(user)
          ? {}
          : { toOutletId: "__none__" }),
    };
  } else if (direction === "outgoing") {
    finalWhere = {
      ...(status ? { status } : { status: { not: TRANSFER_STATUS.CANCELLED } }),
      ...(scope
        ? { fromOutletId: scope }
        : isSuperAdmin(user)
          ? {}
          : { fromOutletId: "__none__" }),
    };
  } else {
    finalWhere = {
      ...(status ? { status } : {}),
      ...(scope
        ? { OR: [{ fromOutletId: scope }, { toOutletId: scope }] }
        : {}),
    };
  }

  const rows = await prisma.transfer.findMany({
    where: finalWhere,
    include: transferInclude,
    orderBy: { createdAt: "desc" },
    take: filters.take ?? 100,
  });

  return rows.map(serializeTransfer);
}

export async function getTransfer(user: SessionUser, id: string) {
  const row = await prisma.transfer.findUnique({
    where: { id },
    include: transferInclude,
  });
  if (!row) return { ok: false as const, error: "Transfer not found." };
  if (!canViewTransfer(user, row.fromOutletId, row.toOutletId)) {
    return { ok: false as const, error: "You do not have access to that transfer." };
  }
  return { ok: true as const, transfer: serializeTransfer(row) };
}

export async function createTransferDraft(
  user: SessionUser,
  input: {
    fromOutletId?: string | null;
    toOutletId?: string | null;
    note?: string | null;
    imageUrl?: string | null;
    lines: TransferLineInput[];
  },
) {
  const source = resolveSourceOutlet(user, input.fromOutletId);
  if ("error" in source) return { ok: false as const, error: source.error };
  const fromOutletId = source.outletId;
  const toOutletId = String(input.toOutletId ?? "").trim();
  const note = String(input.note ?? "").trim();
  const imageUrl = String(input.imageUrl ?? "").trim() || null;

  if (!toOutletId) {
    return { ok: false as const, error: "Choose which outlet should receive the stock." };
  }
  if (fromOutletId === toOutletId) {
    return {
      ok: false as const,
      error: "Source and destination outlets must be different.",
    };
  }

  const linesRaw = input.lines ?? [];
  const merged = new Map<string, number>();
  for (const line of linesRaw) {
    const itemId = String(line.itemId ?? "").trim();
    const quantity = Number(line.quantity);
    if (!itemId) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false as const,
        error: "Each line needs a quantity greater than zero.",
      };
    }
    merged.set(itemId, round2((merged.get(itemId) ?? 0) + quantity));
  }
  if (merged.size === 0) {
    return { ok: false as const, error: "Add at least one product to transfer." };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const [fromOutlet, toOutlet] = await Promise.all([
        tx.outlet.findUnique({
          where: { id: fromOutletId },
          select: { id: true, isActive: true },
        }),
        tx.outlet.findUnique({
          where: { id: toOutletId },
          select: { id: true, isActive: true },
        }),
      ]);
      if (!fromOutlet?.isActive) throw new Error("Source outlet no longer exists.");
      if (!toOutlet?.isActive) {
        throw new Error("Destination outlet no longer exists.");
      }

      const itemIds = [...merged.keys()];
      const items = await tx.inventoryItem.findMany({
        where: { id: { in: itemIds }, isActive: true },
        select: { id: true, name: true, unit: true },
      });
      if (items.length !== itemIds.length) {
        throw new Error("One or more products are not in the catalogue.");
      }
      const byId = new Map(items.map((item) => [item.id, item]));

      // Soft check against current stock so drafts are realistic; hard check on send.
      for (const [itemId, quantity] of merged) {
        const stock = await tx.outletStock.findUnique({
          where: { outletId_itemId: { outletId: fromOutletId, itemId } },
        });
        const onHand = stock?.quantity ?? 0;
        const item = byId.get(itemId)!;
        if (quantity > onHand) {
          throw new Error(
            `Cannot draft ${formatQty(quantity)} ${item.unit} of ${item.name}. Current stock is ${formatQty(onHand)} ${item.unit}.`,
          );
        }
      }

      const reference = await nextTransferReference(tx);
      const transfer = await tx.transfer.create({
        data: {
          reference,
          fromOutletId,
          toOutletId,
          status: TRANSFER_STATUS.DRAFT,
          note: note || null,
          imageUrl,
          createdById: user.id,
          lines: {
            create: itemIds.map((itemId) => ({
              itemId,
              unit: byId.get(itemId)!.unit,
              sentQty: merged.get(itemId)!,
            })),
          },
        },
        include: transferInclude,
      });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          outletId: fromOutletId,
          action: "TRANSFER_DRAFTED",
          detail: `${reference} · ${itemIds.length} line${itemIds.length === 1 ? "" : "s"}`,
        },
      });

      return transfer;
    });

    return { ok: true as const, transfer: serializeTransfer(created) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not create transfer.",
    };
  }
}

export async function sendTransfer(user: SessionUser, transferId: string) {
  const id = String(transferId ?? "").trim();
  if (!id) return { ok: false as const, error: "Missing transfer." };

  try {
    const sent = await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id },
        include: {
          lines: {
            include: { item: { select: { id: true, name: true, unit: true } } },
          },
        },
      });
      if (!transfer) throw new Error("Transfer not found.");
      if (transfer.status === TRANSFER_STATUS.SENT) {
        throw new Error("This transfer has already been sent.");
      }
      if (transfer.status === TRANSFER_STATUS.RECEIVED) {
        throw new Error("This transfer has already been received.");
      }
      if (transfer.status === TRANSFER_STATUS.CANCELLED) {
        throw new Error("This transfer was cancelled.");
      }
      if (transfer.status !== TRANSFER_STATUS.DRAFT) {
        throw new Error("Only draft transfers can be sent.");
      }

      try {
        assertOutletAccess(user, transfer.fromOutletId);
      } catch {
        throw new Error("You do not have access to send from that outlet.");
      }

      if (transfer.lines.length === 0) {
        throw new Error("Add at least one product before sending.");
      }

      for (const line of transfer.lines) {
        const stock = await tx.outletStock.findUnique({
          where: {
            outletId_itemId: {
              outletId: transfer.fromOutletId,
              itemId: line.itemId,
            },
          },
        });
        const onHand = stock?.quantity ?? 0;
        if (!stock || line.sentQty > onHand) {
          throw new Error(
            `Cannot send ${formatQty(line.sentQty)} ${line.unit} of ${line.item.name}. Current stock is ${formatQty(onHand)} ${line.unit}.`,
          );
        }

        const depleted = await tx.outletStock.updateMany({
          where: {
            id: stock.id,
            quantity: { gte: line.sentQty },
          },
          data: { quantity: { decrement: line.sentQty } },
        });
        if (depleted.count !== 1) {
          const fresh = await tx.outletStock.findUnique({
            where: { id: stock.id },
            select: { quantity: true },
          });
          throw new Error(
            `Cannot send ${formatQty(line.sentQty)} ${line.unit} of ${line.item.name}. Current stock is ${formatQty(fresh?.quantity ?? 0)} ${line.unit}.`,
          );
        }
      }

      // Conditional status flip prevents duplicate send.
      const updated = await tx.transfer.updateMany({
        where: { id: transfer.id, status: TRANSFER_STATUS.DRAFT },
        data: {
          status: TRANSFER_STATUS.SENT,
          sentById: user.id,
          sentAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new Error("This transfer has already been sent.");
      }

      await tx.activityLog.create({
        data: {
          userId: user.id,
          outletId: transfer.fromOutletId,
          action: "TRANSFER_SENT",
          detail: `${transfer.reference} · ${transfer.lines.length} line${transfer.lines.length === 1 ? "" : "s"}`,
        },
      });

      return tx.transfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: transferInclude,
      });
    });

    return { ok: true as const, transfer: serializeTransfer(sent) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not send transfer.",
    };
  }
}

export async function receiveTransfer(
  user: SessionUser,
  input: {
    transferId: string;
    lines: { itemId: string; receivedQty: number; discrepancyNote?: string | null }[];
    note?: string | null;
  },
) {
  const id = String(input.transferId ?? "").trim();
  if (!id) return { ok: false as const, error: "Missing transfer." };

  try {
    const received = await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id },
        include: {
          lines: {
            include: { item: { select: { id: true, name: true, unit: true, referencePrice: true } } },
          },
        },
      });
      if (!transfer) throw new Error("Transfer not found.");
      if (transfer.status === TRANSFER_STATUS.RECEIVED) {
        throw new Error("This transfer has already been received.");
      }
      if (transfer.status === TRANSFER_STATUS.DRAFT) {
        throw new Error("This transfer has not been sent yet.");
      }
      if (transfer.status === TRANSFER_STATUS.CANCELLED) {
        throw new Error("This transfer was cancelled.");
      }
      if (transfer.status !== TRANSFER_STATUS.SENT) {
        throw new Error("Only sent transfers can be received.");
      }

      try {
        assertOutletAccess(user, transfer.toOutletId);
      } catch {
        throw new Error("You do not have access to receive at that outlet.");
      }

      const incoming = new Map(
        (input.lines ?? []).map((line) => [
          String(line.itemId).trim(),
          {
            receivedQty: Number(line.receivedQty),
            discrepancyNote: String(line.discrepancyNote ?? "").trim(),
          },
        ]),
      );

      for (const line of transfer.lines) {
        const entry = incoming.get(line.itemId);
        if (!entry || !Number.isFinite(entry.receivedQty) || entry.receivedQty < 0) {
          throw new Error(
            `Enter the received quantity for ${line.item.name}.`,
          );
        }
        const receivedQty = round2(entry.receivedQty);
        if (receivedQty !== round2(line.sentQty) && !entry.discrepancyNote) {
          throw new Error(
            `Add a discrepancy note for ${line.item.name} (sent ${formatQty(line.sentQty)}, received ${formatQty(receivedQty)}).`,
          );
        }

        // Increase destination stock by received amount only.
        if (receivedQty > 0) {
          const existing = await tx.outletStock.findUnique({
            where: {
              outletId_itemId: {
                outletId: transfer.toOutletId,
                itemId: line.itemId,
              },
            },
          });
          await tx.outletStock.upsert({
            where: {
              outletId_itemId: {
                outletId: transfer.toOutletId,
                itemId: line.itemId,
              },
            },
            create: {
              outletId: transfer.toOutletId,
              itemId: line.itemId,
              quantity: receivedQty,
              unitPrice:
                existing?.unitPrice && existing.unitPrice > 0
                  ? existing.unitPrice
                  : line.item.referencePrice,
            },
            update: {
              quantity: { increment: receivedQty },
            },
          });
        }

        await tx.transferLine.update({
          where: { id: line.id },
          data: {
            receivedQty,
            discrepancyNote:
              receivedQty !== round2(line.sentQty)
                ? entry.discrepancyNote
                : null,
          },
        });
      }

      const receiveNote = String(input.note ?? "").trim();
      const updated = await tx.transfer.updateMany({
        where: { id: transfer.id, status: TRANSFER_STATUS.SENT },
        data: {
          status: TRANSFER_STATUS.RECEIVED,
          receivedById: user.id,
          receivedAt: new Date(),
          ...(receiveNote
            ? {
                note: transfer.note
                  ? `${transfer.note}\nReceive note: ${receiveNote}`
                  : `Receive note: ${receiveNote}`,
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error("This transfer has already been received.");
      }

      const discrepancies = transfer.lines.filter((line) => {
        const entry = incoming.get(line.itemId)!;
        return round2(entry.receivedQty) !== round2(line.sentQty);
      }).length;

      await tx.activityLog.create({
        data: {
          userId: user.id,
          outletId: transfer.toOutletId,
          action: "TRANSFER_RECEIVED",
          detail: `${transfer.reference}${
            discrepancies
              ? ` · ${discrepancies} discrepanc${discrepancies === 1 ? "y" : "ies"}`
              : ""
          }`,
        },
      });

      return tx.transfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: transferInclude,
      });
    });

    return { ok: true as const, transfer: serializeTransfer(received) };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not receive transfer.",
    };
  }
}

export async function cancelTransferDraft(user: SessionUser, transferId: string) {
  const id = String(transferId ?? "").trim();
  if (!id) return { ok: false as const, error: "Missing transfer." };

  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({ where: { id } });
      if (!transfer) throw new Error("Transfer not found.");
      if (transfer.status !== TRANSFER_STATUS.DRAFT) {
        throw new Error("Only draft transfers can be cancelled.");
      }
      try {
        assertOutletAccess(user, transfer.fromOutletId);
      } catch {
        throw new Error("You do not have access to cancel that transfer.");
      }

      const updated = await tx.transfer.updateMany({
        where: { id: transfer.id, status: TRANSFER_STATUS.DRAFT },
        data: {
          status: TRANSFER_STATUS.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new Error("Only draft transfers can be cancelled.");
      }

      await tx.activityLog.create({
        data: {
          userId: user.id,
          outletId: transfer.fromOutletId,
          action: "TRANSFER_CANCELLED",
          detail: transfer.reference,
        },
      });

      return tx.transfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: transferInclude,
      });
    });

    return { ok: true as const, transfer: serializeTransfer(cancelled) };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not cancel transfer.",
    };
  }
}

export type TransferPhotoSuggestion = {
  key: string;
  itemId: string;
  name: string;
  unit: string;
  detectedQuantity: number;
  quantity: number;
  onHand: number;
  confidence: number;
  label: string;
  matchReason: string;
  canTransfer: boolean;
};

/**
 * Analyse a transfer photo against the source outlet's stock.
 * Does NOT change inventory — user must confirm into a draft first.
 */
export async function analyzeTransferPhoto(
  user: SessionUser,
  input: {
    outletId?: string | null;
    bytes: Uint8Array;
    mimeType: string;
    imageUrl: string;
  },
) {
  const source = resolveSourceOutlet(user, input.outletId);
  if ("error" in source) return { ok: false as const, error: source.error };
  const outletId = source.outletId;

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

  const suggestions: TransferPhotoSuggestion[] = [];
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
      canTransfer: onHand > 0 && quantity > 0,
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
