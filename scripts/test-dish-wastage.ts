import assert from "node:assert/strict";
import { AVAILABILITY_STATUS, WASTAGE_TARGET } from "../src/lib/constants";
import { calculateDishAvailability } from "../src/lib/dish-availability";
import { calculateDishCost } from "../src/lib/dish-costing";
import { getDishCostAlert } from "../src/lib/cost-alerts";
import { prisma } from "../src/lib/db";
import { multiplyMoney } from "../src/lib/money";
import { recordDishWastage, recordItemWastage, listWastage } from "../src/lib/wastage";

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

async function main() {
  const beforeMovements = await prisma.stockMovement.count();
  const beforeActivity = await prisma.activityLog.count();

  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Dish Waste Cat", sortOrder: 996, area: "BOTH" },
    }));

  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    take: 2,
  });
  while (outlets.length < 2) {
    outlets.push(
      await prisma.outlet.create({
        data: {
          name: `DW Outlet ${outlets.length + 1}`,
          slug: `dw-out-${Date.now()}-${outlets.length}`,
        },
      }),
    );
  }
  const [outletA, outletB] = outlets;

  const strawberries = await prisma.inventoryItem.create({
    data: {
      sku: `DW-S-${Date.now()}`,
      name: "DW Strawberries",
      categoryId: category.id,
      unit: "kg",
      referencePrice: 7,
    },
  });
  const milk = await prisma.inventoryItem.create({
    data: {
      sku: `DW-M-${Date.now()}`,
      name: "DW Milk",
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
        quantity: 5,
        unitPrice: 7,
      },
      {
        outletId: outletA.id,
        itemId: milk.id,
        quantity: 10,
        unitPrice: 1.6,
      },
      {
        outletId: outletB.id,
        itemId: strawberries.id,
        quantity: 5,
        unitPrice: 9,
      },
      {
        outletId: outletB.id,
        itemId: milk.id,
        quantity: 10,
        unitPrice: 2,
      },
    ],
  });

  const dish = await prisma.dish.create({
    data: {
      name: "DW Smoothie",
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

  // 0.1 kg * 7 + 0.25 L * 1.6 = 0.70 + 0.40 = 1.10
  const expectedUnitCost = 1.1;

  const superUser = {
    id: "dw-super",
    role: "SUPER_ADMIN",
    outletId: null as string | null,
    email: "dw-super@test",
    name: "DW Super",
    outletName: null as string | null,
  };
  // Need a real user id for FK on wastage.userId
  const dbSuper =
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } })) ??
    (await prisma.user.create({
      data: {
        email: `dw-super-${Date.now()}@test.local`,
        name: "DW Super",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    }));
  const dbOutletAdmin =
    (await prisma.user.findFirst({
      where: { role: "OUTLET_ADMIN", outletId: outletA.id },
    })) ??
    (await prisma.user.create({
      data: {
        email: `dw-oa-${Date.now()}@test.local`,
        name: "DW OA",
        passwordHash: "x",
        role: "OUTLET_ADMIN",
        outletId: outletA.id,
      },
    }));

  const superActor = {
    id: dbSuper.id,
    role: "SUPER_ADMIN",
    outletId: null as string | null,
    email: dbSuper.email,
    name: dbSuper.name,
    outletName: null as string | null,
  };
  const outletAdmin = {
    id: dbOutletAdmin.id,
    role: "OUTLET_ADMIN",
    outletId: outletA.id,
    email: dbOutletAdmin.email,
    name: dbOutletAdmin.name,
    outletName: outletA.name,
  };

  const costA = await calculateDishCost(superActor, dish.id, outletA.id);
  const costB = await calculateDishCost(superActor, dish.id, outletB.id);
  assert.equal(costA.ok, true);
  assert.equal(costB.ok, true);
  if (costA.ok && costB.ok) {
    assert.equal(costA.cost.dishCost, expectedUnitCost);
    assert.equal(costB.cost.dishCost, expectedUnitCost);
  }
  pass("cost is group-wide and identical regardless of outlet");

  const stockBefore = await prisma.outletStock.findMany({
    where: { itemId: { in: [strawberries.id, milk.id] } },
    orderBy: [{ outletId: "asc" }, { itemId: "asc" }],
  });

  const recorded = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: dish.id,
    quantity: 2,
    reason: "OVERPRODUCTION",
    note: "Lunch overproduction",
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) throw new Error(recorded.error);
  assert.equal(recorded.wastage.quantity, 2);
  assert.equal(recorded.wastage.unitCost, expectedUnitCost);
  assert.equal(recorded.wastage.value, multiplyMoney(2, expectedUnitCost));
  assert.equal(recorded.wastage.value, 2.2);
  pass("DISH wastage records correct quantity and loss = cost × qty");

  const row = await prisma.wastage.findUnique({
    where: { id: recorded.wastage.id },
  });
  assert.ok(row);
  assert.equal(row!.targetType, WASTAGE_TARGET.DISH);
  assert.equal(row!.dishId, dish.id);
  assert.equal(row!.itemId, null);
  assert.equal(row!.targetName, "DW Smoothie");
  assert.equal(row!.unitCost, expectedUnitCost);
  assert.equal(row!.quantity, 2);
  pass("DISH wastage persists targetType DISH + name snapshot");

  await prisma.inventoryItem.update({
    where: { id: strawberries.id },
    data: { referencePrice: 20 },
  });
  const afterPrice = await calculateDishCost(superActor, dish.id);
  assert.equal(afterPrice.ok, true);
  if (afterPrice.ok) {
    assert.notEqual(afterPrice.cost.dishCost, expectedUnitCost);
  }
  const historical = await prisma.wastage.findUnique({
    where: { id: recorded.wastage.id },
  });
  assert.equal(historical!.unitCost, expectedUnitCost);
  assert.equal(
    multiplyMoney(historical!.quantity, historical!.unitCost),
    2.2,
  );
  pass("historical cost snapshot unchanged after ingredient price change");

  await prisma.dishIngredient.updateMany({
    where: { dishId: dish.id, itemId: milk.id },
    data: { quantity: 500 },
  });
  const histName = await prisma.wastage.findUnique({
    where: { id: recorded.wastage.id },
  });
  assert.equal(histName!.targetName, "DW Smoothie");
  assert.equal(histName!.unitCost, expectedUnitCost);
  // restore recipe for later checks
  await prisma.dishIngredient.updateMany({
    where: { dishId: dish.id, itemId: milk.id },
    data: { quantity: 250 },
  });
  await prisma.inventoryItem.update({
    where: { id: strawberries.id },
    data: { referencePrice: 7 },
  });
  pass("historical record remains meaningful after recipe edits");

  const emptyDish = await prisma.dish.create({
    data: {
      name: "DW Empty",
      category: "Other",
      sellingPrice: 3,
    },
  });
  const noRecipe = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: emptyDish.id,
    quantity: 1,
    reason: "SPOILED",
  });
  assert.equal(noRecipe.ok, false);
  if (!noRecipe.ok) assert.match(noRecipe.error, /recipe/i);
  pass("missing recipe blocks submission");

  const incompleteItem = await prisma.inventoryItem.create({
    data: {
      sku: `DW-Z-${Date.now()}`,
      name: "DW Zero Price",
      categoryId: category.id,
      unit: "unit",
      referencePrice: 0,
    },
  });
  const incompleteDish = await prisma.dish.create({
    data: {
      name: "DW Incomplete",
      category: "Other",
      sellingPrice: 4,
      ingredients: {
        create: { itemId: incompleteItem.id, quantity: 1, unit: "unit" },
      },
    },
  });
  const missingPrice = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: incompleteDish.id,
    quantity: 1,
    reason: "SPOILED",
  });
  assert.equal(missingPrice.ok, false);
  if (!missingPrice.ok) assert.match(missingPrice.error, /price|cost/i);
  pass("missing ingredient price blocks submission");

  const badUnitDish = await prisma.dish.create({
    data: {
      name: "DW Bad Unit",
      category: "Other",
      sellingPrice: 4,
      ingredients: {
        create: { itemId: strawberries.id, quantity: 100, unit: "ml" },
      },
    },
  });
  const badUnit = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: badUnitDish.id,
    quantity: 1,
    reason: "SPOILED",
  });
  assert.equal(badUnit.ok, false);
  if (!badUnit.ok) assert.match(badUnit.error, /convert|cost|unit/i);
  pass("invalid unit conversion blocks submission");

  const zeroQty = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: dish.id,
    quantity: 0,
    reason: "SPOILED",
  });
  assert.equal(zeroQty.ok, false);
  const negQty = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: dish.id,
    quantity: -1,
    reason: "SPOILED",
  });
  assert.equal(negQty.ok, false);
  pass("zero or negative quantity rejected");

  const fracQty = await recordDishWastage(superActor, {
    outletId: outletA.id,
    dishId: dish.id,
    quantity: 1.5,
    reason: "SPOILED",
  });
  assert.equal(fracQty.ok, false);
  if (!fracQty.ok) assert.match(fracQty.error, /whole number/i);
  pass("fractional quantity rejected");

  const denied = await recordDishWastage(outletAdmin, {
    outletId: outletB.id,
    dishId: dish.id,
    quantity: 1,
    reason: "SPOILED",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.error, /access/i);
  pass("OUTLET_ADMIN cannot record another outlet's wastage");

  const allowed = await recordDishWastage(outletAdmin, {
    outletId: outletA.id,
    dishId: dish.id,
    quantity: 1,
    reason: "STAFF_ERROR",
  });
  assert.equal(allowed.ok, true);
  pass("OUTLET_ADMIN can record for assigned outlet");

  const superB = await recordDishWastage(superActor, {
    outletId: outletB.id,
    dishId: dish.id,
    quantity: 1,
    reason: "DAMAGED",
  });
  assert.equal(superB.ok, true);
  pass("SUPER_ADMIN can record for any outlet");

  const stockAfter = await prisma.outletStock.findMany({
    where: { itemId: { in: [strawberries.id, milk.id] } },
    orderBy: [{ outletId: "asc" }, { itemId: "asc" }],
  });
  assert.equal(stockAfter.length, stockBefore.length);
  for (const before of stockBefore) {
    const after = stockAfter.find(
      (row) => row.outletId === before.outletId && row.itemId === before.itemId,
    );
    assert.ok(after);
    assert.equal(after!.quantity, before.quantity);
  }
  pass("DISH wastage does not change OutletStock");

  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  pass("DISH wastage creates no StockMovement");

  const activityAfter = await prisma.activityLog.count({
    where: { action: "DISH_WASTAGE_RECORDED" },
  });
  assert.ok(activityAfter >= 1);
  const latestActivity = await prisma.activityLog.findFirst({
    where: { action: "DISH_WASTAGE_RECORDED" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(latestActivity?.detail?.includes("financial loss"));
  pass("DISH wastage creates an ActivityLog");

  // ITEM wastage still deducts stock
  const itemWaste = await recordItemWastage(superActor, {
    outletId: outletA.id,
    itemId: milk.id,
    quantity: 1,
    reason: "SPOILED",
  });
  assert.equal(itemWaste.ok, true);
  const milkStock = await prisma.outletStock.findUnique({
    where: {
      outletId_itemId: { outletId: outletA.id, itemId: milk.id },
    },
  });
  assert.equal(milkStock?.quantity, 9);
  assert.ok((await prisma.stockMovement.count()) > beforeMovements);
  pass("existing ITEM wastage still deducts stock");

  const history = await listWastage(superActor, { outletId: outletA.id });
  assert.ok(history.rows.some((row) => row.targetType === WASTAGE_TARGET.DISH));
  assert.ok(history.rows.some((row) => row.targetType === WASTAGE_TARGET.ITEM));
  assert.ok(
    history.rows.some(
      (row) =>
        row.targetType === WASTAGE_TARGET.ITEM && row.itemId === milk.id,
    ),
  );
  pass("ITEM and DISH wastage history both readable");

  const alert = await getDishCostAlert(superActor, dish.id);
  assert.equal(alert.ok, true);
  pass("Cost Alerts remain readable after dish wastage");

  const availability = await calculateDishAvailability(
    superActor,
    dish.id,
    outletA.id,
  );
  assert.equal(availability.ok, true);
  if (availability.ok) {
    // Strawberries still 5kg; milk now 9L after item wastage — availability
    // changed only from ITEM wastage, not from DISH wastage portion.
    // After dish wastage alone stock was unchanged; milk item waste reduced milk.
    assert.ok(
      availability.availability.status === AVAILABILITY_STATUS.AVAILABLE ||
        availability.availability.status === AVAILABILITY_STATUS.LOW,
    );
  }
  // Prove dish wastage itself didn't move strawberry stock (still 5)
  const strawStock = await prisma.outletStock.findUnique({
    where: {
      outletId_itemId: { outletId: outletA.id, itemId: strawberries.id },
    },
  });
  assert.equal(strawStock?.quantity, 5);
  pass("Dish Availability unchanged by DISH wastage (ingredient stock intact)");

  // Cleanup test artefacts
  await prisma.wastage.deleteMany({
    where: {
      OR: [
        { dishId: { in: [dish.id, emptyDish.id, incompleteDish.id, badUnitDish.id] } },
        { itemId: { in: [milk.id, strawberries.id, incompleteItem.id] } },
      ],
    },
  });
  await prisma.stockMovement.deleteMany({
    where: { itemId: { in: [milk.id, strawberries.id] } },
  });
  await prisma.dishIngredient.deleteMany({
    where: {
      dishId: {
        in: [dish.id, emptyDish.id, incompleteDish.id, badUnitDish.id],
      },
    },
  });
  await prisma.dish.deleteMany({
    where: {
      id: { in: [dish.id, emptyDish.id, incompleteDish.id, badUnitDish.id] },
    },
  });
  await prisma.outletStock.deleteMany({
    where: {
      itemId: { in: [strawberries.id, milk.id, incompleteItem.id] },
    },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [strawberries.id, milk.id, incompleteItem.id] } },
  });

  void beforeActivity;
  void superUser;
  console.log("\nAll dish wastage tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
