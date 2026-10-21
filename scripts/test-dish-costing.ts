import assert from "node:assert/strict";
import {
  calculateDishCost,
  calculateDishCostFromParts,
} from "../src/lib/dish-costing";
import { multiplyMoney, percentOf, roundEuros } from "../src/lib/money";
import { prisma } from "../src/lib/db";

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

assert.equal(multiplyMoney(0.1, 5), 0.5);
assert.equal(roundEuros(1.234), 1.23);
assert.equal(percentOf(2.5, 10), 25);
assert.equal(percentOf(3, 0), null);
pass("money helpers");

{
  const cost = calculateDishCostFromParts({
    dishId: "d1",
    dishName: "Smoothie",
    sellingPrice: 5,
    lines: [
      {
        ingredientId: "i1",
        itemId: "straw",
        itemName: "Strawberries",
        recipeQuantity: 100,
        recipeUnit: "g",
        stockUnit: "kg",
        referencePrice: 5,
      },
      {
        ingredientId: "i2",
        itemId: "milk",
        itemName: "Milk",
        recipeQuantity: 250,
        recipeUnit: "ml",
        stockUnit: "litre",
        referencePrice: 1.6,
      },
      {
        ingredientId: "i3",
        itemId: "banana",
        itemName: "Banana",
        recipeQuantity: 1,
        recipeUnit: "unit",
        stockUnit: "unit",
        referencePrice: 0.3,
      },
    ],
  });
  assert.equal(cost.status, "COMPLETE");
  assert.equal(cost.dishCost, 1.2);
  assert.equal(cost.priceScope, "group");
  assert.equal(cost.outletId, null);
  pass("three ingredients use reference prices only");
}

// outletPrice must NOT be used even if passed
{
  const cost = calculateDishCostFromParts({
    dishId: "d2",
    dishName: "Milkshake",
    sellingPrice: 4,
    lines: [
      {
        ingredientId: "i1",
        itemId: "milk",
        itemName: "Milk",
        recipeQuantity: 1,
        recipeUnit: "litre",
        stockUnit: "litre",
        referencePrice: 1.5,
        outletPrice: 9.99,
      },
    ],
  });
  assert.equal(cost.dishCost, 1.5);
  pass("outletPrice ignored; referencePrice used");
}

{
  const cost = calculateDishCostFromParts({
    dishId: "d3",
    dishName: "Missing",
    sellingPrice: 5,
    lines: [
      {
        ingredientId: "i1",
        itemId: "x",
        itemName: "Mystery",
        recipeQuantity: 1,
        recipeUnit: "unit",
        stockUnit: "unit",
        referencePrice: 0,
        outletPrice: 4,
      },
    ],
  });
  assert.equal(cost.status, "INCOMPLETE");
  assert.equal(cost.dishCost, null);
  assert.equal(cost.ingredients[0]?.ingredientCost, null);
  pass("missing reference price unresolved (outlet price not used)");
}

{
  const a = calculateDishCostFromParts({
    dishId: "d4",
    dishName: "Same",
    sellingPrice: 4,
    lines: [
      {
        ingredientId: "i1",
        itemId: "milk",
        itemName: "Milk",
        recipeQuantity: 1,
        recipeUnit: "litre",
        stockUnit: "litre",
        referencePrice: 1.5,
      },
    ],
  });
  const b = calculateDishCostFromParts({
    dishId: "d4",
    dishName: "Same",
    sellingPrice: 4,
    lines: [
      {
        ingredientId: "i1",
        itemId: "milk",
        itemName: "Milk",
        recipeQuantity: 1,
        recipeUnit: "litre",
        stockUnit: "litre",
        referencePrice: 1.5,
      },
    ],
  });
  assert.equal(a.dishCost, b.dishCost);
  pass("same recipe → same group cost");
}

async function dbChecks() {
  const beforeMovements = await prisma.stockMovement.count();

  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Cost Cat", sortOrder: 998, area: "BOTH" },
    }));

  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    take: 3,
  });
  while (outlets.length < 3) {
    outlets.push(
      await prisma.outlet.create({
        data: {
          name: `Cost Outlet ${outlets.length + 1}`,
          slug: `cost-out-${Date.now()}-${outlets.length}`,
        },
      }),
    );
  }

  const item = await prisma.inventoryItem.create({
    data: {
      sku: `COST-G-${Date.now()}`,
      name: "Group Strawberries",
      categoryId: category.id,
      unit: "kg",
      referencePrice: 5,
    },
  });

  // Different outlet unit prices — must not affect dish cost
  for (const [index, outlet] of outlets.entries()) {
    await prisma.outletStock.create({
      data: {
        outletId: outlet.id,
        itemId: item.id,
        quantity: 10 + index,
        unitPrice: 5 + index, // 5, 6, 7
      },
    });
  }

  const dish = await prisma.dish.create({
    data: {
      name: "Group Cost Smoothie",
      category: "Smoothies",
      sellingPrice: 6,
      ingredients: {
        create: { itemId: item.id, quantity: 100, unit: "g" },
      },
    },
  });

  const superUser = { id: "cost-super", role: "SUPER_ADMIN", outletId: null };
  const costs = [];
  for (const outlet of outlets) {
    const result = await calculateDishCost(superUser, dish.id, outlet.id);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.cost.dishCost, 0.5);
      assert.equal(result.cost.sellingPrice, 6);
      assert.equal(result.cost.priceScope, "group");
      costs.push(result.cost.dishCost);
    }
  }
  assert.equal(new Set(costs).size, 1);
  pass("Valletta/Balluta/Naxxar-style outlets share the same dish cost");

  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { referencePrice: 8 },
  });
  const after = await calculateDishCost(superUser, dish.id);
  assert.equal(after.ok, true);
  if (after.ok) {
    assert.equal(after.cost.dishCost, 0.8);
    assert.equal(after.cost.sellingPrice, 6);
  }
  pass("global price change updates dish cost; selling unchanged");

  const qtyBefore = await prisma.outletStock.findMany({
    where: { itemId: item.id },
    select: { outletId: true, quantity: true },
  });
  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  pass("costing did not create stock movements");
  assert.ok(qtyBefore.every((row) => row.quantity >= 10));
  pass("stock quantities remain outlet-specific");

  await prisma.dishIngredient.deleteMany({ where: { dishId: dish.id } });
  await prisma.dish.delete({ where: { id: dish.id } });
  await prisma.outletStock.deleteMany({ where: { itemId: item.id } });
  await prisma.inventoryItem.delete({ where: { id: item.id } });
}

dbChecks()
  .then(() => {
    console.log("\nAll group dish costing tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
