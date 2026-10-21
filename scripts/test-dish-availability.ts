import assert from "node:assert/strict";
import { AVAILABILITY_STATUS } from "../src/lib/constants";
import {
  calculateDishAvailability,
  calculateDishAvailabilityFromParts,
  calculateDishAvailabilitiesForOutlet,
  classifyAvailability,
} from "../src/lib/dish-availability";
import { calculateDishCost } from "../src/lib/dish-costing";
import { prisma } from "../src/lib/db";

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

const smoothieLines = (
  strawberryStock: number,
  milkStock: number,
  extras: Partial<{
    strawberryUnit: string;
    milkUnit: string;
    strawberryRecipeUnit: string;
    milkRecipeUnit: string;
    strawberryPack: number | null;
  }> = {},
) => [
  {
    ingredientId: "i1",
    itemId: "straw",
    itemName: "Strawberries",
    recipeQuantity: 100,
    recipeUnit: extras.strawberryRecipeUnit ?? "g",
    stockUnit: extras.strawberryUnit ?? "kg",
    quantityInStock: strawberryStock,
    supplierPackQty: extras.strawberryPack ?? null,
  },
  {
    ingredientId: "i2",
    itemId: "milk",
    itemName: "Milk",
    recipeQuantity: 250,
    recipeUnit: extras.milkRecipeUnit ?? "ml",
    stockUnit: extras.milkUnit ?? "litre",
    quantityInStock: milkStock,
  },
];

{
  const result = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Strawberry Smoothie",
    outletId: "valletta",
    outletName: "Valletta",
    lines: smoothieLines(2, 3),
  });
  assert.equal(result.portionsPossible, 12);
  assert.equal(result.status, AVAILABILITY_STATUS.AVAILABLE);
  assert.equal(result.limitingIngredientName, "Milk");
  assert.equal(result.stockScope, "outlet");
  pass("multi-ingredient MIN portions (2kg / 100g, 3L / 250ml → 12)");
}

{
  const result = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Smoothie",
    outletId: "o1",
    outletName: "O1",
    lines: smoothieLines(0.5, 10),
  });
  // 0.5 kg / 0.1 kg = 5 portions; milk plenty → 5 → AVAILABLE
  assert.equal(result.portionsPossible, 5);
  assert.equal(result.status, AVAILABILITY_STATUS.AVAILABLE);
  pass("kg/g conversion");
}

{
  const result = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Smoothie",
    outletId: "o1",
    outletName: "O1",
    lines: smoothieLines(10, 1),
  });
  // milk 1 L / 0.25 L = 4 → LOW
  assert.equal(result.portionsPossible, 4);
  assert.equal(result.status, AVAILABILITY_STATUS.LOW);
  assert.equal(result.limitingIngredientName, "Milk");
  pass("L/ml conversion + LOW (1–4 portions)");
}

{
  const result = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Box dish",
    outletId: "o1",
    outletName: "O1",
    lines: [
      {
        ingredientId: "i1",
        itemId: "eggs",
        itemName: "Eggs",
        recipeQuantity: 2,
        recipeUnit: "unit",
        stockUnit: "box",
        supplierPackQty: 12,
        quantityInStock: 1, // 12 eaches → 6 portions
      },
    ],
  });
  assert.equal(result.portionsPossible, 6);
  assert.equal(result.status, AVAILABILITY_STATUS.AVAILABLE);
  pass("pack conversion via supplierPackQty");
}

{
  const zero = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Smoothie",
    outletId: "o1",
    outletName: "O1",
    lines: smoothieLines(0, 3),
  });
  assert.equal(zero.portionsPossible, 0);
  assert.equal(zero.status, AVAILABILITY_STATUS.UNAVAILABLE);
  assert.ok(zero.missingIngredients.some((row) => row.itemName === "Strawberries"));
  pass("zero stock → Unavailable with missing explanation");
}

{
  const short = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Smoothie",
    outletId: "o1",
    outletName: "O1",
    lines: smoothieLines(0.05, 3), // 50g → 0 portions of 100g
  });
  assert.equal(short.portionsPossible, 0);
  assert.equal(short.status, AVAILABILITY_STATUS.UNAVAILABLE);
  pass("insufficient for one portion → Unavailable");
}

{
  assert.equal(classifyAvailability(1, false), AVAILABILITY_STATUS.LOW);
  assert.equal(classifyAvailability(4, false), AVAILABILITY_STATUS.LOW);
  assert.equal(classifyAvailability(5, false), AVAILABILITY_STATUS.AVAILABLE);
  assert.equal(classifyAvailability(0, false), AVAILABILITY_STATUS.UNAVAILABLE);
  assert.equal(classifyAvailability(null, true), AVAILABILITY_STATUS.UNRESOLVED);
  pass("status thresholds: 0 / 1–4 / ≥5 / unresolved");
}

{
  const none = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Empty",
    outletId: "o1",
    outletName: "O1",
    lines: [],
  });
  assert.equal(none.status, AVAILABILITY_STATUS.UNRESOLVED);
  assert.equal(none.portionsPossible, null);
  pass("missing recipe → Unresolved");
}

{
  const bad = calculateDishAvailabilityFromParts({
    dishId: "d1",
    dishName: "Bad units",
    outletId: "o1",
    outletName: "O1",
    lines: [
      {
        ingredientId: "i1",
        itemId: "x",
        itemName: "Mystery",
        recipeQuantity: 100,
        recipeUnit: "ml",
        stockUnit: "kg",
        quantityInStock: 5,
      },
    ],
  });
  assert.equal(bad.status, AVAILABILITY_STATUS.UNRESOLVED);
  assert.ok(bad.ingredients[0]?.issue);
  pass("invalid conversion → Unresolved");
}

async function dbChecks() {
  const beforeMovements = await prisma.stockMovement.count();

  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Avail Cat", sortOrder: 997, area: "BOTH" },
    }));

  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    take: 2,
  });
  while (outlets.length < 2) {
    outlets.push(
      await prisma.outlet.create({
        data: {
          name: `Avail Outlet ${outlets.length + 1}`,
          slug: `avail-out-${Date.now()}-${outlets.length}`,
        },
      }),
    );
  }
  const [outletA, outletB] = outlets;

  const strawberries = await prisma.inventoryItem.create({
    data: {
      sku: `AVAIL-S-${Date.now()}`,
      name: "Avail Strawberries",
      categoryId: category.id,
      unit: "kg",
      referencePrice: 5,
    },
  });
  const milk = await prisma.inventoryItem.create({
    data: {
      sku: `AVAIL-M-${Date.now()}`,
      name: "Avail Milk",
      categoryId: category.id,
      unit: "litre",
      referencePrice: 1.6,
    },
  });

  await prisma.outletStock.createMany({
    data: [
      {
        outletId: outletA.id,
        itemId: strawberries.id,
        quantity: 2,
        unitPrice: 5,
      },
      {
        outletId: outletA.id,
        itemId: milk.id,
        quantity: 3,
        unitPrice: 1.6,
      },
      {
        outletId: outletB.id,
        itemId: strawberries.id,
        quantity: 0.2,
        unitPrice: 5,
      },
      {
        outletId: outletB.id,
        itemId: milk.id,
        quantity: 10,
        unitPrice: 1.6,
      },
    ],
  });

  const dish = await prisma.dish.create({
    data: {
      name: "Avail Smoothie",
      category: "Smoothies",
      sellingPrice: 5,
      ingredients: {
        create: [
          { itemId: strawberries.id, quantity: 100, unit: "g" },
          { itemId: milk.id, quantity: 250, unit: "ml" },
        ],
      },
    },
  });

  const superUser = { id: "avail-super", role: "SUPER_ADMIN", outletId: null };
  const outletAdminA = {
    id: "avail-oa",
    role: "OUTLET_ADMIN",
    outletId: outletA.id,
  };

  const a = await calculateDishAvailability(superUser, dish.id, outletA.id);
  assert.equal(a.ok, true);
  if (a.ok) {
    assert.equal(a.availability.portionsPossible, 12);
    assert.equal(a.availability.status, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(a.availability.outletId, outletA.id);
  }
  pass("outlet A availability from live stock");

  const b = await calculateDishAvailability(superUser, dish.id, outletB.id);
  assert.equal(b.ok, true);
  if (b.ok) {
    assert.equal(b.availability.portionsPossible, 2);
    assert.equal(b.availability.status, AVAILABILITY_STATUS.LOW);
    assert.equal(b.availability.outletId, outletB.id);
  }
  pass("different outlets produce different availability");

  const denied = await calculateDishAvailability(
    outletAdminA,
    dish.id,
    outletB.id,
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.match(denied.error, /access/i);
  }
  pass("OUTLET_ADMIN cannot read another outlet's availability");

  const own = await calculateDishAvailability(outletAdminA, dish.id);
  assert.equal(own.ok, true);
  if (own.ok) {
    assert.equal(own.availability.outletId, outletA.id);
    assert.equal(own.availability.portionsPossible, 12);
  }
  pass("OUTLET_ADMIN locked to assigned outlet");

  // Simulate stock-take / delivery / wastage / transfer effects via OutletStock.
  await prisma.outletStock.update({
    where: {
      outletId_itemId: { outletId: outletA.id, itemId: milk.id },
    },
    data: { quantity: 0.5 }, // 2 portions → LOW
  });
  const afterStockTake = await calculateDishAvailability(
    superUser,
    dish.id,
    outletA.id,
  );
  assert.equal(afterStockTake.ok, true);
  if (afterStockTake.ok) {
    assert.equal(afterStockTake.availability.portionsPossible, 2);
    assert.equal(afterStockTake.availability.status, AVAILABILITY_STATUS.LOW);
  }
  pass("stock quantity change (stock-take style) updates availability");

  await prisma.outletStock.update({
    where: {
      outletId_itemId: { outletId: outletA.id, itemId: milk.id },
    },
    data: { quantity: 5 },
  });
  const afterDelivery = await calculateDishAvailability(
    superUser,
    dish.id,
    outletA.id,
  );
  assert.equal(afterDelivery.ok, true);
  if (afterDelivery.ok) {
    assert.equal(afterDelivery.availability.portionsPossible, 20);
    assert.equal(
      afterDelivery.availability.status,
      AVAILABILITY_STATUS.AVAILABLE,
    );
  }
  pass("delivery-style stock increase updates availability");

  await prisma.outletStock.update({
    where: {
      outletId_itemId: { outletId: outletA.id, itemId: strawberries.id },
    },
    data: { quantity: 0.1 },
  });
  const afterWastage = await calculateDishAvailability(
    superUser,
    dish.id,
    outletA.id,
  );
  assert.equal(afterWastage.ok, true);
  if (afterWastage.ok) {
    assert.equal(afterWastage.availability.portionsPossible, 1);
    assert.equal(afterWastage.availability.status, AVAILABILITY_STATUS.LOW);
  }
  pass("wastage-style stock decrease updates availability");

  // Transfer send from A / receive at B
  await prisma.outletStock.update({
    where: {
      outletId_itemId: { outletId: outletA.id, itemId: strawberries.id },
    },
    data: { quantity: 0 },
  });
  await prisma.outletStock.update({
    where: {
      outletId_itemId: { outletId: outletB.id, itemId: strawberries.id },
    },
    data: { quantity: 1 },
  });
  const sourceAfterSend = await calculateDishAvailability(
    superUser,
    dish.id,
    outletA.id,
  );
  const destAfterReceive = await calculateDishAvailability(
    superUser,
    dish.id,
    outletB.id,
  );
  assert.equal(sourceAfterSend.ok, true);
  assert.equal(destAfterReceive.ok, true);
  if (sourceAfterSend.ok && destAfterReceive.ok) {
    assert.equal(sourceAfterSend.availability.portionsPossible, 0);
    assert.equal(
      sourceAfterSend.availability.status,
      AVAILABILITY_STATUS.UNAVAILABLE,
    );
    assert.equal(destAfterReceive.availability.portionsPossible, 10);
  }
  pass("transfer send/receive change source and destination availability");

  const movementsBeforeRead = await prisma.stockMovement.count();
  const stockBeforeRead = await prisma.outletStock.findMany({
    where: { itemId: { in: [strawberries.id, milk.id] } },
  });
  await calculateDishAvailabilitiesForOutlet(
    superUser,
    [dish.id],
    outletA.id,
  );
  assert.equal(await prisma.stockMovement.count(), movementsBeforeRead);
  const stockAfterRead = await prisma.outletStock.findMany({
    where: { itemId: { in: [strawberries.id, milk.id] } },
  });
  assert.equal(stockAfterRead.length, stockBeforeRead.length);
  for (const row of stockBeforeRead) {
    const after = stockAfterRead.find(
      (candidate) =>
        candidate.outletId === row.outletId && candidate.itemId === row.itemId,
    );
    assert.ok(after);
    assert.equal(after!.quantity, row.quantity);
  }
  pass("availability checks do not change stock or create movements");

  // Costing unchanged (group-wide) while availability is outlet-scoped
  const costA = await calculateDishCost(superUser, dish.id, outletA.id);
  const costB = await calculateDishCost(superUser, dish.id, outletB.id);
  assert.equal(costA.ok, true);
  assert.equal(costB.ok, true);
  if (costA.ok && costB.ok) {
    assert.equal(costA.cost.dishCost, costB.cost.dishCost);
    assert.equal(costA.cost.priceScope, "group");
  }
  pass("group-wide costing unchanged alongside availability");

  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  pass("test cleanup path left no extra movements from availability reads");

  await prisma.dishIngredient.deleteMany({ where: { dishId: dish.id } });
  await prisma.dish.delete({ where: { id: dish.id } });
  await prisma.outletStock.deleteMany({
    where: { itemId: { in: [strawberries.id, milk.id] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [strawberries.id, milk.id] } },
  });
}

dbChecks()
  .then(() => {
    console.log("\nAll dish availability tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
