/**
 * Idempotent historical stock-movement backfill.
 * Does not invent quantityBefore/quantityAfter for delta-only sources.
 * Safe to re-run (unique on referenceType+referenceId+movementType+itemId).
 */
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  }),
});

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function insert(data: {
  outletId: string;
  itemId: string;
  movementType: string;
  quantityChange: number;
  unit: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  performedById?: string | null;
  referenceType: string;
  referenceId: string;
  note?: string | null;
  createdAt: Date;
}) {
  if (round2(data.quantityChange) === 0) return "skipped";
  try {
    await prisma.stockMovement.create({
      data: {
        ...data,
        quantityChange: round2(data.quantityChange),
        performedById: data.performedById ?? null,
        note: data.note ?? null,
      },
    });
    return "created";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("Unique constraint") ||
      message.includes("UNIQUE constraint")
    ) {
      return "skipped";
    }
    throw error;
  }
}

async function main() {
  let created = 0;
  let skipped = 0;

  const takes = await prisma.stockTake.findMany({
    where: { status: "SUBMITTED" },
    include: {
      lines: { include: { item: { select: { unit: true } } } },
    },
  });
  for (const take of takes) {
    for (const line of take.lines) {
      const change = round2(line.countedQty - line.previousQty);
      const result = await insert({
        outletId: take.outletId,
        itemId: line.itemId,
        movementType: "STOCK_TAKE_ADJUSTMENT",
        quantityChange: change,
        unit: line.item.unit,
        quantityBefore: round2(line.previousQty),
        quantityAfter: round2(line.countedQty),
        performedById: take.userId,
        referenceType: "STOCK_TAKE_LINE",
        referenceId: line.id,
        note: `Backfill from ${take.reference}`,
        createdAt: take.submittedAt ?? take.createdAt,
      });
      if (result === "created") created += 1;
      else skipped += 1;
    }
  }

  const deliveries = await prisma.delivery.findMany({
    include: {
      lines: { include: { item: { select: { unit: true } } } },
    },
  });
  for (const delivery of deliveries) {
    for (const line of delivery.lines) {
      const result = await insert({
        outletId: delivery.outletId,
        itemId: line.itemId,
        movementType: "DELIVERY",
        quantityChange: round2(line.quantity),
        unit: line.item.unit,
        quantityBefore: null,
        quantityAfter: null,
        performedById: delivery.userId,
        referenceType: "DELIVERY_LINE",
        referenceId: line.id,
        note: "Backfill · balances not reconstructed",
        createdAt: delivery.createdAt,
      });
      if (result === "created") created += 1;
      else skipped += 1;
    }
  }

  const wastageRows = await prisma.wastage.findMany();
  for (const row of wastageRows) {
    const result = await insert({
      outletId: row.outletId,
      itemId: row.itemId,
      movementType: "WASTAGE",
      quantityChange: -round2(row.quantity),
      unit: row.unit,
      quantityBefore: null,
      quantityAfter: null,
      performedById: row.userId,
      referenceType: "WASTAGE",
      referenceId: row.id,
      note: row.note
        ? `Backfill · ${row.note}`
        : "Backfill · balances not reconstructed",
      createdAt: row.createdAt,
    });
    if (result === "created") created += 1;
    else skipped += 1;
  }

  const transfers = await prisma.transfer.findMany({
    where: { status: { in: ["SENT", "RECEIVED"] } },
    include: { lines: true },
  });
  for (const transfer of transfers) {
    for (const line of transfer.lines) {
      const outResult = await insert({
        outletId: transfer.fromOutletId,
        itemId: line.itemId,
        movementType: "TRANSFER_OUT",
        quantityChange: -round2(line.sentQty),
        unit: line.unit,
        quantityBefore: null,
        quantityAfter: null,
        performedById: transfer.sentById ?? transfer.createdById,
        referenceType: "TRANSFER_LINE",
        referenceId: line.id,
        note: `Backfill ${transfer.reference} · balances not reconstructed`,
        createdAt: transfer.sentAt ?? transfer.createdAt,
      });
      if (outResult === "created") created += 1;
      else skipped += 1;

      if (transfer.status === "RECEIVED" && line.receivedQty !== null) {
        const inResult = await insert({
          outletId: transfer.toOutletId,
          itemId: line.itemId,
          movementType: "TRANSFER_IN",
          quantityChange: round2(line.receivedQty),
          unit: line.unit,
          quantityBefore: null,
          quantityAfter: null,
          performedById: transfer.receivedById ?? transfer.createdById,
          referenceType: "TRANSFER_LINE",
          referenceId: line.id,
          note: `Backfill ${transfer.reference} · balances not reconstructed`,
          createdAt: transfer.receivedAt ?? transfer.createdAt,
        });
        if (inResult === "created") created += 1;
        else skipped += 1;
      }
    }
  }

  console.log(`Backfill complete · created ${created} · skipped ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
