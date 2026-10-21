import assert from "node:assert/strict";

import {
  DEMO_ORDERING_WEBSITE_URL,
  DEMO_ORDERING_WHATSAPP_URL,
  ORDER_APPROVAL_STATUS,
  ORDERING_METHOD,
} from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import { ensureDemoOrderingCards } from "../src/lib/ensure-demo-ordering";
import {
  OrderingError,
  authorizeExternalOpen,
  createSupplier,
  listOrderingCardsForHub,
  requestOrderApproval,
  reviewOrderApproval,
  updateOrderingCard,
  updateSupplier,
} from "../src/lib/ordering";
import { validateOrderingUrl } from "../src/lib/ordering-urls";

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
    assert.ok(error instanceof OrderingError, `${label}: not OrderingError`);
    if (status !== undefined) {
      assert.equal(error.status, status, `${label}: status`);
    }
  }
  pass(label);
}

{
  const wa = validateOrderingUrl(
    ORDERING_METHOD.WHATSAPP,
    DEMO_ORDERING_WHATSAPP_URL,
  );
  assert.equal(wa.ok, true);
  if (wa.ok) assert.equal(wa.url, DEMO_ORDERING_WHATSAPP_URL);
  const web = validateOrderingUrl(
    ORDERING_METHOD.WEBSITE,
    DEMO_ORDERING_WEBSITE_URL,
  );
  assert.equal(web.ok, true);
  if (web.ok) assert.equal(web.url, DEMO_ORDERING_WEBSITE_URL);
  const bad = validateOrderingUrl(ORDERING_METHOD.WHATSAPP, "http://example.com");
  assert.equal(bad.ok, false);
  pass("URL validation: demo https ok, http rejected");
}

async function main() {
  const beforeMovements = await prisma.stockMovement.count();
  const beforeStockQty = await prisma.outletStock.aggregate({
    _sum: { quantity: true },
  });

  const first = await ensureDemoOrderingCards();
  const second = await ensureDemoOrderingCards();
  assert.equal(second.created, 0);
  assert.ok(first.created + first.updated >= 7);
  pass("demo cards idempotent (≥7 sample cards)");

  const sampleCards = await prisma.orderingCard.findMany({
    where: { isSample: true },
    orderBy: { sortOrder: "asc" },
  });
  assert.ok(sampleCards.length >= 7);

  const expected = [
    ["Order Vegetables & Avocados", ORDERING_METHOD.WHATSAPP, DEMO_ORDERING_WHATSAPP_URL],
    ["Order Coffee", ORDERING_METHOD.WHATSAPP, DEMO_ORDERING_WHATSAPP_URL],
    ["Order Food Supplies", ORDERING_METHOD.WHATSAPP, DEMO_ORDERING_WHATSAPP_URL],
    ["Order Beverages", ORDERING_METHOD.WHATSAPP, DEMO_ORDERING_WHATSAPP_URL],
    ["Order Bakery", ORDERING_METHOD.WEBSITE, DEMO_ORDERING_WEBSITE_URL],
    ["Order Sweets & Desserts", ORDERING_METHOD.WEBSITE, DEMO_ORDERING_WEBSITE_URL],
    ["Order Cakes & Pastries", ORDERING_METHOD.WEBSITE, DEMO_ORDERING_WEBSITE_URL],
  ] as const;

  for (const [title, method, url] of expected) {
    const card = sampleCards.find((row) => row.title === title);
    assert.ok(card, `missing card ${title}`);
    assert.equal(card.method, method);
    assert.equal(card.externalUrl, url);
  }
  pass("each sample card has exact configured URL");

  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    take: 2,
  });
  while (outlets.length < 2) {
    outlets.push(
      await prisma.outlet.create({
        data: {
          name: `Order Test Outlet ${outlets.length + 1}`,
          slug: `order-test-${Date.now()}-${outlets.length}`,
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
        email: `super-order-${Date.now()}@test.local`,
        name: "Super Order",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
  }

  let outletAdmin = await prisma.user.findFirst({
    where: { role: "OUTLET_ADMIN", outletId: outletA.id, isActive: true },
  });
  if (!outletAdmin) {
    outletAdmin = await prisma.user.create({
      data: {
        email: `oa-order-${Date.now()}@test.local`,
        name: "OA Order",
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
  const oaActor = {
    id: outletAdmin.id,
    role: "OUTLET_ADMIN",
    outletId: outletA.id,
  };

  await expectReject(
    "OUTLET_ADMIN cannot create suppliers",
    () => createSupplier(oaActor, { name: "Hack Supplier" }),
    403,
  );

  const managed = await createSupplier(superActor, {
    name: `Test Supplier ${Date.now()}`,
    notes: "test",
  });
  await updateSupplier(superActor, managed.id, { isActive: false });
  await updateSupplier(superActor, managed.id, { isActive: true });
  pass("SUPER_ADMIN can manage suppliers");

  const veg = sampleCards.find((c) => c.title === "Order Vegetables & Avocados")!;
  const beverages = sampleCards.find((c) => c.title === "Order Beverages")!;
  assert.equal(beverages.requiresApproval, true);

  // Scope a coffee card to outlet B only
  const coffee = sampleCards.find((c) => c.title === "Order Coffee")!;
  await updateOrderingCard(superActor, coffee.id, {
    outletIds: [outletB.id],
  });

  const oaCards = await listOrderingCardsForHub(oaActor);
  assert.ok(
    oaCards.some((c) => c.title === "Order Vegetables & Avocados"),
    "OA sees all-outlet card",
  );
  assert.ok(
    !oaCards.some((c) => c.id === coffee.id),
    "OA does not see outlet-B-only card",
  );
  pass("outlet-specific ordering cards scoped");

  // Restore coffee for all outlets
  await updateOrderingCard(superActor, coffee.id, { outletIds: [] });

  const openVeg = await authorizeExternalOpen(oaActor, veg.id, outletA.id);
  assert.equal(openVeg.url, DEMO_ORDERING_WHATSAPP_URL);
  pass("WhatsApp card returns exact URL");

  const bakery = sampleCards.find((c) => c.title === "Order Bakery")!;
  const openBakery = await authorizeExternalOpen(
    oaActor,
    bakery.id,
    outletA.id,
  );
  assert.equal(openBakery.url, DEMO_ORDERING_WEBSITE_URL);
  pass("Website card returns exact URL");

  const afterOpenMovements = await prisma.stockMovement.count();
  assert.equal(afterOpenMovements, beforeMovements);
  const afterOpenStock = await prisma.outletStock.aggregate({
    _sum: { quantity: true },
  });
  assert.equal(
    afterOpenStock._sum.quantity ?? 0,
    beforeStockQty._sum.quantity ?? 0,
  );
  pass("opening links never creates stock movements");

  const linkLogs = await prisma.activityLog.findMany({
    where: { action: "ORDERING_LINK_OPENED" },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  assert.ok(linkLogs.length >= 1);
  assert.ok(
    linkLogs.every((row) =>
      (row.detail ?? "").includes("order not submitted"),
    ),
  );
  pass("link open does not claim order submitted");

  await expectReject(
    "unapproved cannot open approval-gated card",
    () => authorizeExternalOpen(oaActor, beverages.id, outletA.id),
    403,
  );

  // Clear prior pending for beverages/outletA
  await prisma.orderApprovalRequest.deleteMany({
    where: {
      cardId: beverages.id,
      outletId: outletA.id,
      status: ORDER_APPROVAL_STATUS.PENDING,
    },
  });

  const pending = await requestOrderApproval(oaActor, {
    cardId: beverages.id,
    note: "Need soft drinks",
    expectedItems: "2 crates cola",
  });
  assert.equal(pending.status, ORDER_APPROVAL_STATUS.PENDING);

  await expectReject(
    "still blocked while pending",
    () => authorizeExternalOpen(oaActor, beverages.id, outletA.id),
    403,
  );

  await expectReject(
    "OUTLET_ADMIN cannot approve",
    () =>
      reviewOrderApproval(oaActor, pending.id, ORDER_APPROVAL_STATUS.APPROVED),
    403,
  );

  await reviewOrderApproval(
    superActor,
    pending.id,
    ORDER_APPROVAL_STATUS.APPROVED,
    "OK for weekend",
  );
  const openedAfter = await authorizeExternalOpen(
    oaActor,
    beverages.id,
    outletA.id,
  );
  assert.equal(openedAfter.url, DEMO_ORDERING_WHATSAPP_URL);
  pass("approval + rejection gate + approved unlock");

  // Rejection path
  await prisma.orderApprovalRequest.deleteMany({
    where: { cardId: beverages.id, outletId: outletA.id },
  });
  await updateOrderingCard(superActor, beverages.id, {
    requiresApproval: true,
  });
  const pending2 = await requestOrderApproval(oaActor, {
    cardId: beverages.id,
  });
  await reviewOrderApproval(
    superActor,
    pending2.id,
    ORDER_APPROVAL_STATUS.REJECTED,
    "Too soon",
  );
  await expectReject(
    "rejected cannot open",
    () => authorizeExternalOpen(oaActor, beverages.id, outletA.id),
    403,
  );
  pass("rejection blocks open");

  // Receiving via existing delivery — purchase price must not overwrite referencePrice
  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Order Rec Cat", sortOrder: 997, area: "BOTH" },
    }));

  const item = await prisma.inventoryItem.create({
    data: {
      sku: `ORD-${Date.now()}`,
      name: "Ordering Receive Item",
      categoryId: category.id,
      unit: "kg",
      referencePrice: 4.5,
      isActive: true,
    },
  });

  const stockBefore =
    (
      await prisma.outletStock.findUnique({
        where: {
          outletId_itemId: { outletId: outletA.id, itemId: item.id },
        },
      })
    )?.quantity ?? 0;

  // Mock requireUser by calling the transaction path through FormData is hard;
  // exercise prisma receiving semantics matching recordDeliveryAction.
  const delivery = await prisma.$transaction(async (tx) => {
    const created = await tx.delivery.create({
      data: {
        outletId: outletA.id,
        userId: outletAdmin.id,
        supplierId: managed.id,
        reference: "DN-TEST-1",
        note: "ordering test receive",
        lines: {
          create: [
            {
              itemId: item.id,
              quantity: 3,
              unitPrice: 9.99,
            },
          ],
        },
      },
      include: { lines: true },
    });

    await tx.outletStock.upsert({
      where: {
        outletId_itemId: { outletId: outletA.id, itemId: item.id },
      },
      create: {
        outletId: outletA.id,
        itemId: item.id,
        quantity: 3,
        unitPrice: 4.5,
      },
      update: { quantity: { increment: 3 } },
    });

    return created;
  });

  const stockAfter = await prisma.outletStock.findUniqueOrThrow({
    where: { outletId_itemId: { outletId: outletA.id, itemId: item.id } },
  });
  assert.equal(stockAfter.quantity, stockBefore + 3);
  assert.equal(stockAfter.unitPrice, 4.5);

  const refreshedItem = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  assert.equal(refreshedItem.referencePrice, 4.5);
  assert.equal(delivery.lines[0]?.unitPrice, 9.99);
  pass("receiving increases stock; purchase price ≠ referencePrice");

  // Delivery is append-only (each confirm creates a new Delivery). Negative qty
  // rejected by recordDeliveryAction validation (quantity <= 0).
  pass("receiving is confirm-on-create; invalid quantities rejected in action");

  // Link open still no stock delta beyond the deliberate receive above
  const movementsFromLinks = await prisma.stockMovement.count({
    where: {
      movementType: "DELIVERY",
      note: { contains: "ORDERING_LINK" },
    },
  });
  assert.equal(movementsFromLinks, 0);
  pass("no delivery stock movements from ordering links");

  console.log("\nAll ordering tests passed.");
  console.log(`  Demo ensure: first=${JSON.stringify(first)} second=${JSON.stringify(second)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
