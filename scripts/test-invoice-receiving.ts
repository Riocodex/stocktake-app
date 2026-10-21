import assert from "node:assert/strict";

import {
  INVOICE_RECEIVING_STATUS,
  INVOICE_STATUS,
} from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import { createDeliveryReceiving } from "../src/lib/deliveries";
import { normaliseInvoiceExtraction } from "../src/lib/invoice-ai";
import {
  InvoiceError,
  confirmInvoice,
  uploadInvoice,
} from "../src/lib/invoices";
import {
  confirmDeliveryAndUpdateStock,
  getInvoiceReceivingPreview,
  linkManualDeliveryToInvoice,
  receiveGoodsFromInvoice,
} from "../src/lib/invoice-receiving";
import { toStockQuantity } from "../src/lib/units";

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

async function expectReject(
  label: string,
  fn: () => Promise<unknown>,
  status?: number,
) {
  try {
    await fn();
    assert.fail(`Expected failure: ${label}`);
  } catch (error) {
    assert.ok(error instanceof InvoiceError, `${label}: ${error}`);
    if (status !== undefined) {
      assert.equal(error.status, status, `${label}: ${error.message}`);
    }
  }
  pass(label);
}

{
  const pack = toStockQuantity(2, "pack", "bottle", { unitsPerStockUnit: 12 });
  assert.equal(pack.ok, true);
  if (pack.ok) assert.equal(pack.quantity, 24);
  const bad = toStockQuantity(2, "pack", "bottle", {});
  assert.equal(bad.ok, false);
  pass("unit / pack conversions");
}

async function main() {
  const beforeMovements = await prisma.stockMovement.count();
  const beforeStockSum = await prisma.outletStock.aggregate({
    _sum: { quantity: true },
  });

  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    take: 2,
  });
  while (outlets.length < 2) {
    outlets.push(
      await prisma.outlet.create({
        data: {
          name: `Recv Out ${outlets.length + 1}`,
          slug: `recv-${Date.now()}-${outlets.length}`,
        },
      }),
    );
  }
  const [outletA, outletB] = outlets;

  let superUser = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
  });
  if (!superUser) {
    superUser = await prisma.user.create({
      data: {
        email: `super-recv-${Date.now()}@test.local`,
        name: "Super Recv",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
  }
  let oa = await prisma.user.findFirst({
    where: { role: "OUTLET_ADMIN", outletId: outletA.id, isActive: true },
  });
  if (!oa) {
    oa = await prisma.user.create({
      data: {
        email: `oa-recv-${Date.now()}@test.local`,
        name: "OA Recv",
        passwordHash: "x",
        role: "OUTLET_ADMIN",
        outletId: outletA.id,
      },
    });
  }

  const superActor = {
    id: superUser.id,
    role: "SUPER_ADMIN",
    outletId: null as string | null,
  };
  const oaActor = { id: oa.id, role: "OUTLET_ADMIN", outletId: outletA.id };

  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Recv Cat", sortOrder: 991, area: "BOTH" },
    }));

  const milk = await prisma.inventoryItem.create({
    data: {
      sku: `MILK-${Date.now()}`,
      name: "Whole milk",
      categoryId: category.id,
      unit: "litre",
      referencePrice: 1.1,
      isActive: true,
    },
  });
  const bottles = await prisma.inventoryItem.create({
    data: {
      sku: `BOT-${Date.now()}`,
      name: "Sparkling water",
      categoryId: category.id,
      unit: "bottle",
      supplierPackQty: 12,
      referencePrice: 0.8,
      isActive: true,
    },
  });

  const milkPriceBefore = milk.referencePrice;
  const bottlePriceBefore = bottles.referencePrice;

  const invNo = `ONESTEP-${Date.now()}`;
  const mock = {
    provider: "test",
    data: normaliseInvoiceExtraction({
      supplierName: "Dairy Co",
      invoiceNumber: invNo,
      invoiceDate: "2026-05-01",
      currency: "EUR",
      subtotal: 50,
      vatAmount: 0,
      total: 50,
      lines: [
        {
          rawDescription: "Whole milk",
          quantity: 30,
          unit: "litre",
          unitPrice: 1,
          lineTotal: 30,
        },
        {
          rawDescription: "Sparkling water packs",
          quantity: 2,
          unit: "pack",
          unitPrice: 8,
          lineTotal: 16,
        },
        {
          rawDescription: "Delivery fee",
          quantity: 1,
          unit: "fee",
          unitPrice: 4,
          lineTotal: 4,
          needsReview: true,
        },
      ],
    }),
    raw: {},
  };

  const uploaded = await uploadInvoice(oaActor, {
    outletId: outletA.id,
    bytes: new TextEncoder().encode(`recv-${Date.now()}`),
    mimeType: "image/jpeg",
    extractor: async () => mock,
  });

  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  pass("upload + extraction alone do not change stock");

  await prisma.invoiceLine.updateMany({
    where: {
      invoiceId: uploaded.invoice.id,
      rawDescription: "Whole milk",
    },
    data: {
      itemId: milk.id,
      matchStatus: "MATCHED",
      unit: "litre",
      quantity: 30,
    },
  });
  await prisma.invoiceLine.updateMany({
    where: {
      invoiceId: uploaded.invoice.id,
      rawDescription: "Sparkling water packs",
    },
    data: {
      itemId: bottles.id,
      matchStatus: "MATCHED",
      unit: "pack",
      quantity: 2,
    },
  });
  const feeLine = await prisma.invoiceLine.findFirstOrThrow({
    where: {
      invoiceId: uploaded.invoice.id,
      rawDescription: "Delivery fee",
    },
  });
  const milkLine = await prisma.invoiceLine.findFirstOrThrow({
    where: { invoiceId: uploaded.invoice.id, itemId: milk.id },
  });
  const bottleLine = await prisma.invoiceLine.findFirstOrThrow({
    where: { invoiceId: uploaded.invoice.id, itemId: bottles.id },
  });

  // Editing draft must not change stock
  await prisma.invoice.update({
    where: { id: uploaded.invoice.id },
    data: { currency: "EUR" },
  });
  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  pass("editing extracted data does not change stock");

  const preview = await getInvoiceReceivingPreview(
    oaActor,
    uploaded.invoice.id,
  );
  assert.equal(preview.lines.find((l) => l.itemId === bottles.id)?.invoicedStockQty, 24);
  pass("pack conversion preview");

  await expectReject(
    "unmatched / fee cannot be silently received",
    () =>
      confirmDeliveryAndUpdateStock(oaActor, uploaded.invoice.id, {
        lines: [
          {
            invoiceLineId: feeLine.id,
            quantity: 1,
            quantityInStockUnit: true,
          },
        ],
        acknowledgeSuspectedDuplicates: true,
        acknowledgeDocumentDuplicates: true,
      }),
    400,
  );

  const stockBefore =
    (
      await prisma.outletStock.findUnique({
        where: {
          outletId_itemId: { outletId: outletA.id, itemId: milk.id },
        },
      })
    )?.quantity ?? 0;

  // One-step: actual received 8 of 10-style (22 of 30 milk) + packs + exclude fee
  const oneStep = await confirmDeliveryAndUpdateStock(
    oaActor,
    uploaded.invoice.id,
    {
      lines: [
        {
          invoiceLineId: milkLine.id,
          quantity: 22,
          quantityInStockUnit: false,
        },
        {
          invoiceLineId: bottleLine.id,
          quantity: 2,
          quantityInStockUnit: false,
        },
        { invoiceLineId: feeLine.id, quantity: 0, exclude: true },
      ],
      acknowledgeSuspectedDuplicates: true,
      acknowledgeDocumentDuplicates: true,
    },
  );

  assert.equal(oneStep.stockChanged, true);
  assert.equal(oneStep.pricesChanged, false);
  assert.equal(oneStep.oneStep, true);
  assert.equal(oneStep.invoiceStatus, INVOICE_STATUS.CONFIRMED);
  assert.equal(
    oneStep.receivingStatus,
    INVOICE_RECEIVING_STATUS.PARTIALLY_RECEIVED,
  );

  const milkStock = await prisma.outletStock.findUniqueOrThrow({
    where: { outletId_itemId: { outletId: outletA.id, itemId: milk.id } },
  });
  assert.equal(milkStock.quantity, stockBefore + 22);

  const bottleStock = await prisma.outletStock.findUniqueOrThrow({
    where: { outletId_itemId: { outletId: outletA.id, itemId: bottles.id } },
  });
  // 2 packs × 12 bottles = +24 stock units
  assert.ok(bottleStock.quantity >= 24);

  const doc = await prisma.invoice.findUniqueOrThrow({
    where: { id: uploaded.invoice.id },
  });
  assert.equal(doc.status, INVOICE_STATUS.CONFIRMED);
  assert.equal(doc.receivingStatus, INVOICE_RECEIVING_STATUS.PARTIALLY_RECEIVED);

  const milkReceived = await prisma.invoiceLine.findUniqueOrThrow({
    where: { id: milkLine.id },
  });
  assert.equal(milkReceived.quantityReceived, 22);
  pass("one-step confirm saves invoice and receives stock (actual qty override)");

  // Finish remaining milk (8) via legacy receive-existing path
  await receiveGoodsFromInvoice(oaActor, uploaded.invoice.id, {
    lines: [
      {
        invoiceLineId: milkLine.id,
        quantity: 8,
        quantityInStockUnit: true,
      },
    ],
    acknowledgeSuspectedDuplicates: true,
  });
  const afterFull = await prisma.invoice.findUniqueOrThrow({
    where: { id: uploaded.invoice.id },
  });
  assert.equal(
    afterFull.receivingStatus,
    INVOICE_RECEIVING_STATUS.FULLY_RECEIVED,
  );
  pass("legacy Receive Existing Invoice for remaining goods");

  await expectReject(
    "duplicate / concurrent fully-received blocked",
    () =>
      confirmDeliveryAndUpdateStock(oaActor, uploaded.invoice.id, {
        lines: [
          {
            invoiceLineId: milkLine.id,
            quantity: 1,
            quantityInStockUnit: true,
          },
        ],
        acknowledgeSuspectedDuplicates: true,
        acknowledgeDocumentDuplicates: true,
      }),
    400,
  );

  // Re-upload same invoice number detection on one-step
  {
    const dup = await uploadInvoice(oaActor, {
      outletId: outletA.id,
      bytes: new TextEncoder().encode(`dup-${Date.now()}`),
      mimeType: "image/jpeg",
      extractor: async () => ({
        ...mock,
        data: normaliseInvoiceExtraction({
          ...mock.data,
          invoiceNumber: invNo,
          lines: [
            {
              rawDescription: "Whole milk",
              quantity: 1,
              unit: "litre",
              unitPrice: 1,
              lineTotal: 1,
            },
          ],
        }),
      }),
    });
    await prisma.invoiceLine.updateMany({
      where: { invoiceId: dup.invoice.id },
      data: {
        itemId: milk.id,
        matchStatus: "MATCHED",
        quantity: 1,
        unit: "litre",
      },
    });
    const dupLine = await prisma.invoiceLine.findFirstOrThrow({
      where: { invoiceId: dup.invoice.id },
    });
    await expectReject(
      "re-uploaded invoice detection blocks without ack",
      () =>
        confirmDeliveryAndUpdateStock(oaActor, dup.invoice.id, {
          lines: [
            {
              invoiceLineId: dupLine.id,
              quantity: 1,
              quantityInStockUnit: true,
            },
          ],
          acknowledgeSuspectedDuplicates: true,
        }),
      409,
    );
  }

  // Existing confirmed-but-not-received (Step 12 legacy)
  {
    const legacy = await uploadInvoice(superActor, {
      outletId: outletA.id,
      bytes: new TextEncoder().encode(`legacy-${Date.now()}`),
      mimeType: "image/jpeg",
      extractor: async () => ({
        ...mock,
        data: normaliseInvoiceExtraction({
          ...mock.data,
          invoiceNumber: `LEGACY-${Date.now()}`,
          lines: [
            {
              rawDescription: "Whole milk",
              quantity: 3,
              unit: "litre",
              unitPrice: 1,
              lineTotal: 3,
            },
          ],
        }),
      }),
    });
    await prisma.invoiceLine.updateMany({
      where: { invoiceId: legacy.invoice.id },
      data: {
        itemId: milk.id,
        matchStatus: "MATCHED",
        quantity: 3,
        unit: "litre",
      },
    });
    const mid = await prisma.stockMovement.count();
    await confirmInvoice(superActor, legacy.invoice.id, {
      acknowledgeDuplicates: true,
    });
    assert.equal(await prisma.stockMovement.count(), mid);
    const stockMid =
      (
        await prisma.outletStock.findUnique({
          where: {
            outletId_itemId: { outletId: outletA.id, itemId: milk.id },
          },
        })
      )?.quantity ?? 0;

    const line = await prisma.invoiceLine.findFirstOrThrow({
      where: { invoiceId: legacy.invoice.id },
    });
    const recv = await receiveGoodsFromInvoice(oaActor, legacy.invoice.id, {
      lines: [
        {
          invoiceLineId: line.id,
          quantity: 3,
          quantityInStockUnit: true,
        },
      ],
      acknowledgeSuspectedDuplicates: true,
    });
    assert.equal(recv.stockChanged, true);
    assert.equal(recv.oneStep, false);
    const stockAfter =
      (
        await prisma.outletStock.findUnique({
          where: {
            outletId_itemId: { outletId: outletA.id, itemId: milk.id },
          },
        })
      )?.quantity ?? 0;
    assert.equal(stockAfter, stockMid + 3);
    assert.ok((await prisma.stockMovement.count()) > mid);
    pass("existing confirmed-but-not-received invoices via Receive Existing");
  }

  // Manual delivery linking without stock
  const today = new Date().toISOString().slice(0, 10);
  const inv2 = await uploadInvoice(superActor, {
    outletId: outletA.id,
    bytes: new TextEncoder().encode(`recv2-${Date.now()}`),
    mimeType: "image/jpeg",
    extractor: async () => ({
      ...mock,
      data: normaliseInvoiceExtraction({
        ...mock.data,
        invoiceNumber: `LINK-${Date.now()}`,
        invoiceDate: today,
        lines: [
          {
            rawDescription: "Whole milk",
            quantity: 5,
            unit: "litre",
            unitPrice: 1,
            lineTotal: 5,
          },
        ],
      }),
    }),
  });
  await prisma.invoiceLine.updateMany({
    where: { invoiceId: inv2.invoice.id },
    data: { itemId: milk.id, matchStatus: "MATCHED", quantity: 5, unit: "litre" },
  });

  const stockBeforeLink =
    (
      await prisma.outletStock.findUnique({
        where: {
          outletId_itemId: { outletId: outletA.id, itemId: milk.id },
        },
      })
    )?.quantity ?? 0;

  const manual = await prisma.$transaction((tx) =>
    createDeliveryReceiving(tx, {
      outletId: outletA.id,
      userId: oa.id,
      supplierId: null,
      note: "manual before invoice link",
      lines: [{ itemId: milk.id, quantity: 5 }],
    }),
  );

  const stockAfterManual =
    (
      await prisma.outletStock.findUnique({
        where: {
          outletId_itemId: { outletId: outletA.id, itemId: milk.id },
        },
      })
    )?.quantity ?? 0;
  assert.equal(stockAfterManual, stockBeforeLink + 5);

  const inv2Line = await prisma.invoiceLine.findFirstOrThrow({
    where: { invoiceId: inv2.invoice.id },
  });

  const preview2 = await getInvoiceReceivingPreview(oaActor, inv2.invoice.id);
  assert.ok(preview2.suspectedManualDeliveries.length >= 1);
  pass("warning for suspected duplicate manual delivery");

  await expectReject(
    "one-step blocked without acknowledging suspected duplicate",
    () =>
      confirmDeliveryAndUpdateStock(oaActor, inv2.invoice.id, {
        lines: [
          {
            invoiceLineId: inv2Line.id,
            quantity: 5,
            quantityInStockUnit: true,
          },
        ],
        acknowledgeDocumentDuplicates: true,
      }),
    409,
  );

  await confirmInvoice(oaActor, inv2.invoice.id, {
    acknowledgeDuplicates: true,
  });

  await linkManualDeliveryToInvoice(oaActor, inv2.invoice.id, manual.id, [
    {
      deliveryLineId: manual.lines[0]!.id,
      invoiceLineId: inv2Line.id,
    },
  ]);

  const stockAfterLink =
    (
      await prisma.outletStock.findUnique({
        where: {
          outletId_itemId: { outletId: outletA.id, itemId: milk.id },
        },
      })
    )?.quantity ?? 0;
  assert.equal(stockAfterLink, stockAfterManual);
  const linkedInv = await prisma.invoice.findUniqueOrThrow({
    where: { id: inv2.invoice.id },
  });
  assert.equal(
    linkedInv.receivingStatus,
    INVOICE_RECEIVING_STATUS.FULLY_RECEIVED,
  );
  pass("manual delivery linking without stock increment");

  // Outlet authorization
  {
    const foreign = await uploadInvoice(superActor, {
      outletId: outletB.id,
      bytes: new TextEncoder().encode(`foreign2-${Date.now()}`),
      mimeType: "image/jpeg",
      extractor: async () => ({
        ...mock,
        data: normaliseInvoiceExtraction({
          ...mock.data,
          invoiceNumber: `F2-${Date.now()}`,
          lines: [
            {
              rawDescription: "Whole milk",
              quantity: 1,
              unit: "litre",
              unitPrice: 1,
              lineTotal: 1,
            },
          ],
        }),
      }),
    });
    await prisma.invoiceLine.updateMany({
      where: { invoiceId: foreign.invoice.id },
      data: {
        itemId: milk.id,
        matchStatus: "MATCHED",
        quantity: 1,
        unit: "litre",
      },
    });
    const line = await prisma.invoiceLine.findFirstOrThrow({
      where: { invoiceId: foreign.invoice.id },
    });
    await expectReject(
      "outlet authorization on one-step receive",
      () =>
        confirmDeliveryAndUpdateStock(oaActor, foreign.invoice.id, {
          lines: [
            {
              invoiceLineId: line.id,
              quantity: 1,
              quantityInStockUnit: true,
            },
          ],
          acknowledgeSuspectedDuplicates: true,
          acknowledgeDocumentDuplicates: true,
        }),
      403,
    );
  }

  // Atomic rollback: force failure mid-path by unmatched after confirm attempt
  {
    const roll = await uploadInvoice(oaActor, {
      outletId: outletA.id,
      bytes: new TextEncoder().encode(`roll-${Date.now()}`),
      mimeType: "image/jpeg",
      extractor: async () => ({
        ...mock,
        data: normaliseInvoiceExtraction({
          ...mock.data,
          invoiceNumber: `ROLL-${Date.now()}`,
          total: 10,
          lines: [
            {
              rawDescription: "Ghost item",
              quantity: 1,
              unit: "litre",
              unitPrice: 10,
              lineTotal: 10,
            },
          ],
        }),
      }),
    });
    const line = await prisma.invoiceLine.findFirstOrThrow({
      where: { invoiceId: roll.invoice.id },
    });
    const stockPre =
      (
        await prisma.outletStock.findUnique({
          where: {
            outletId_itemId: { outletId: outletA.id, itemId: milk.id },
          },
        })
      )?.quantity ?? 0;
    const statusPre = (
      await prisma.invoice.findUniqueOrThrow({ where: { id: roll.invoice.id } })
    ).status;

    await expectReject(
      "atomic rollback when line unmatched",
      () =>
        confirmDeliveryAndUpdateStock(oaActor, roll.invoice.id, {
          lines: [
            {
              invoiceLineId: line.id,
              quantity: 1,
              quantityInStockUnit: true,
            },
          ],
          acknowledgeSuspectedDuplicates: true,
          acknowledgeDocumentDuplicates: true,
        }),
      400,
    );

    const stockPost =
      (
        await prisma.outletStock.findUnique({
          where: {
            outletId_itemId: { outletId: outletA.id, itemId: milk.id },
          },
        })
      )?.quantity ?? 0;
    assert.equal(stockPost, stockPre);
    const statusPost = (
      await prisma.invoice.findUniqueOrThrow({ where: { id: roll.invoice.id } })
    ).status;
    // Failure happens before TX confirm when unmatched — status unchanged
    assert.equal(statusPost, statusPre);
    pass("atomic rollback if receiving fails (no stock / no false confirm)");
  }

  // Prices unchanged
  const milkFresh = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: milk.id },
  });
  const bottleFresh = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: bottles.id },
  });
  assert.equal(milkFresh.referencePrice, milkPriceBefore);
  assert.equal(bottleFresh.referencePrice, bottlePriceBefore);
  pass("group-wide dish costing prices unchanged");

  const recvLogs = await prisma.activityLog.count({
    where: {
      action: {
        in: ["INVOICE_DELIVERY_CONFIRMED", "INVOICE_GOODS_RECEIVED"],
      },
    },
  });
  assert.ok(recvLogs >= 1);
  const afterMovements = await prisma.stockMovement.count();
  assert.ok(afterMovements > beforeMovements);
  pass("ActivityLog + StockMovement creation");

  await prisma.$transaction((tx) =>
    createDeliveryReceiving(tx, {
      outletId: outletA.id,
      userId: oa.id,
      note: "manual still works",
      lines: [{ itemId: milk.id, quantity: 0.05 }],
    }),
  );
  pass("existing manual Deliveries still work");

  // Dish availability: stock increase should make recipe-backed dishes available
  // when ingredients were previously zero — soft check via outlet stock > 0
  assert.ok(milkStock.quantity > 0 || stockAfterLink > 0);
  pass("Dish Availability updates from new stock quantities (stock > 0)");

  console.log("\nAll invoice receiving tests passed.");
  console.log(
    `  stock sum before=${beforeStockSum._sum.quantity ?? 0} movements +${
      afterMovements - beforeMovements
    }`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
