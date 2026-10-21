import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import {
  addRecipeIngredient,
  removeRecipeIngredient,
  updateRecipeIngredient,
} from "../src/lib/recipes";
import type { RecipeActor } from "../src/lib/recipes";

const superUser: RecipeActor = {
  id: "verify-super",
  role: "SUPER_ADMIN",
  outletId: null,
};

const outletUser: RecipeActor = {
  id: "verify-outlet",
  role: "OUTLET_ADMIN",
  outletId: "outlet-x",
};

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

async function main() {
  const beforeStock = await prisma.outletStock.count();
  const beforeMovements = await prisma.stockMovement.count();

  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Verify Cat", sortOrder: 999, area: "BOTH" },
    }));

  const strawberries = await prisma.inventoryItem.create({
    data: {
      sku: `VRIFY-STRW-${Date.now()}`,
      name: "Verify Strawberries",
      categoryId: category.id,
      unit: "kg",
      referencePrice: 4,
    },
  });

  const boxed = await prisma.inventoryItem.create({
    data: {
      sku: `VRIFY-BOX-${Date.now()}`,
      name: "Verify Tea Bags",
      categoryId: category.id,
      unit: "box",
      supplierPackQty: 20,
      referencePrice: 3,
    },
  });

  const inactive = await prisma.inventoryItem.create({
    data: {
      sku: `VRIFY-OFF-${Date.now()}`,
      name: "Verify Inactive",
      categoryId: category.id,
      unit: "unit",
      isActive: false,
      referencePrice: 1,
    },
  });

  const dish = await prisma.dish.create({
    data: {
      name: "Verify Smoothie Recipe",
      category: "Smoothies",
      sellingPrice: 5,
    },
  });

  const denied = await addRecipeIngredient(outletUser, dish.id, {
    itemId: strawberries.id,
    quantity: 100,
    unit: "g",
  });
  assert.equal(denied.ok, false);
  pass("OUTLET_ADMIN cannot add ingredients");

  const zero = await addRecipeIngredient(superUser, dish.id, {
    itemId: strawberries.id,
    quantity: 0,
    unit: "g",
  });
  assert.equal(zero.ok, false);
  pass("zero quantity rejected");

  const neg = await addRecipeIngredient(superUser, dish.id, {
    itemId: strawberries.id,
    quantity: -5,
    unit: "g",
  });
  assert.equal(neg.ok, false);
  pass("negative quantity rejected");

  const badUnit = await addRecipeIngredient(superUser, dish.id, {
    itemId: strawberries.id,
    quantity: 1,
    unit: "bottle",
  });
  assert.equal(badUnit.ok, false);
  pass("incompatible unit rejected");

  const inactiveAdd = await addRecipeIngredient(superUser, dish.id, {
    itemId: inactive.id,
    quantity: 1,
    unit: "unit",
  });
  assert.equal(inactiveAdd.ok, false);
  pass("inactive item cannot be newly added");

  const added = await addRecipeIngredient(superUser, dish.id, {
    itemId: strawberries.id,
    quantity: 100,
    unit: "g",
  });
  assert.equal(added.ok, true);
  if (added.ok) {
    assert.equal(added.ingredient.quantityInStockUnit, 0.1);
  }
  pass("SUPER_ADMIN adds 100g strawberries → 0.1 kg");

  const dup = await addRecipeIngredient(superUser, dish.id, {
    itemId: strawberries.id,
    quantity: 50,
    unit: "g",
  });
  assert.equal(dup.ok, false);
  pass("duplicate ingredient rejected");

  const boxedAdd = await addRecipeIngredient(superUser, dish.id, {
    itemId: boxed.id,
    quantity: 5,
    unit: "unit",
  });
  assert.equal(boxedAdd.ok, true);
  if (boxedAdd.ok) {
    assert.equal(boxedAdd.ingredient.quantityInStockUnit, 0.25);
  }
  pass("pack conversion 5 unit / 20 → 0.25 box");

  assert.ok(added.ok);
  const updated = await updateRecipeIngredient(
    superUser,
    dish.id,
    added.ingredient.id,
    { quantity: 200, unit: "g" },
  );
  assert.equal(updated.ok, true);
  if (updated.ok) assert.equal(updated.ingredient.quantityInStockUnit, 0.2);
  pass("SUPER_ADMIN edits quantity");

  const outletEdit = await updateRecipeIngredient(
    outletUser,
    dish.id,
    added.ingredient.id,
    { quantity: 10, unit: "g" },
  );
  assert.equal(outletEdit.ok, false);
  pass("OUTLET_ADMIN cannot edit recipe");

  assert.ok(boxedAdd.ok);
  const removed = await removeRecipeIngredient(
    superUser,
    dish.id,
    boxedAdd.ingredient.id,
  );
  assert.equal(removed.ok, true);
  pass("SUPER_ADMIN removes ingredient");

  // Soft-deactivate item; existing line remains readable
  await prisma.inventoryItem.update({
    where: { id: strawberries.id },
    data: { isActive: false },
  });
  const stillThere = await prisma.dishIngredient.findFirst({
    where: { dishId: dish.id, itemId: strawberries.id },
    include: { item: true },
  });
  assert.ok(stillThere);
  assert.equal(stillThere.item.isActive, false);
  pass("existing recipe readable after item deactivated");

  assert.equal(await prisma.outletStock.count(), beforeStock);
  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  pass("recipe edits did not change stock or movements");

  // cleanup
  await prisma.dishIngredient.deleteMany({ where: { dishId: dish.id } });
  await prisma.dish.delete({ where: { id: dish.id } });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [strawberries.id, boxed.id, inactive.id] } },
  });

  console.log("\nAll recipe tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
