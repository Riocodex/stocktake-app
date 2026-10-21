import assert from "node:assert/strict";
import { COST_ALERT_LEVEL } from "../src/lib/constants";
import { classifyFoodCostAlert } from "../src/lib/cost-alerts";
import {
  getFoodCostThresholds,
  updateFoodCostThresholds,
  validateFoodCostThresholds,
} from "../src/lib/settings";
import { getDishCostAlert, listDishCostAlerts } from "../src/lib/cost-alerts";
import { prisma } from "../src/lib/db";

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

const thresholds = { warningPercent: 30, criticalPercent: 35 };

{
  assert.equal(
    classifyFoodCostAlert(29.9, 10, "COMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.HEALTHY,
  );
  assert.equal(
    classifyFoodCostAlert(30, 10, "COMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.WARNING,
  );
  assert.equal(
    classifyFoodCostAlert(34.9, 10, "COMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.WARNING,
  );
  assert.equal(
    classifyFoodCostAlert(35, 10, "COMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.CRITICAL,
  );
  pass("healthy / warning / critical + boundaries");
}

{
  assert.equal(
    classifyFoodCostAlert(null, 10, "NO_RECIPE", thresholds).alertLevel,
    COST_ALERT_LEVEL.UNRESOLVED,
  );
  assert.equal(
    classifyFoodCostAlert(null, 10, "INCOMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.UNRESOLVED,
  );
  assert.equal(
    classifyFoodCostAlert(50, 0, "COMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.UNRESOLVED,
  );
  assert.equal(
    classifyFoodCostAlert(10, -1, "COMPLETE", thresholds).alertLevel,
    COST_ALERT_LEVEL.UNRESOLVED,
  );
  pass("missing recipe / prices / invalid selling → Unresolved");
}

{
  const bad = validateFoodCostThresholds(40, 30);
  assert.equal(bad.ok, false);
  const neg = validateFoodCostThresholds(-1, 10);
  assert.equal(neg.ok, false);
  const ok = validateFoodCostThresholds(25, 40);
  assert.equal(ok.ok, true);
  pass("threshold validation");
}

async function dbChecks() {
  const beforeMovements = await prisma.stockMovement.count();
  const beforeStock = await prisma.outletStock.count();

  const defaults = await getFoodCostThresholds();
  assert.ok(defaults.warningPercent >= 0);
  assert.ok(defaults.criticalPercent > defaults.warningPercent);
  pass("default thresholds available");

  const outletDenied = await updateFoodCostThresholds(
    { id: "oa", role: "OUTLET_ADMIN", outletId: "x" },
    28,
    33,
  );
  assert.equal(outletDenied.ok, false);
  pass("OUTLET_ADMIN cannot change thresholds");

  const superOk = await updateFoodCostThresholds(
    { id: "sa", role: "SUPER_ADMIN", outletId: null },
    30,
    35,
  );
  assert.equal(superOk.ok, true);
  pass("SUPER_ADMIN can set thresholds");

  const category =
    (await prisma.category.findFirst()) ??
    (await prisma.category.create({
      data: { name: "Alert Cat", sortOrder: 997, area: "BOTH" },
    }));

  const item = await prisma.inventoryItem.create({
    data: {
      sku: `ALERT-${Date.now()}`,
      name: "Alert Milk",
      categoryId: category.id,
      unit: "litre",
      referencePrice: 2,
    },
  });

  // Healthy: 0.5L * €2 = €1 cost, sell €10 → 10%
  const healthy = await prisma.dish.create({
    data: {
      name: "Alert Healthy Shake",
      category: "Smoothies",
      sellingPrice: 10,
      ingredients: {
        create: { itemId: item.id, quantity: 500, unit: "ml" },
      },
    },
  });

  // Warning: cost €3.2 / sell €10 = 32%
  const warning = await prisma.dish.create({
    data: {
      name: "Alert Warning Shake",
      category: "Smoothies",
      sellingPrice: 10,
      ingredients: {
        create: { itemId: item.id, quantity: 1600, unit: "ml" },
      },
    },
  });

  // Critical: cost €4 / sell €10 = 40%
  const critical = await prisma.dish.create({
    data: {
      name: "Alert Critical Shake",
      category: "Smoothies",
      sellingPrice: 10,
      ingredients: {
        create: { itemId: item.id, quantity: 2000, unit: "ml" },
      },
    },
  });

  const unresolved = await prisma.dish.create({
    data: {
      name: "Alert No Recipe",
      category: "Smoothies",
      sellingPrice: 10,
    },
  });

  const actor = { id: "sa", role: "SUPER_ADMIN", outletId: null };

  const h = await getDishCostAlert(actor, healthy.id);
  assert.equal(h.ok, true);
  if (h.ok) assert.equal(h.alert.alertLevel, COST_ALERT_LEVEL.HEALTHY);

  const w = await getDishCostAlert(actor, warning.id);
  assert.equal(w.ok, true);
  if (w.ok) assert.equal(w.alert.alertLevel, COST_ALERT_LEVEL.WARNING);

  const c = await getDishCostAlert(actor, critical.id);
  assert.equal(c.ok, true);
  if (c.ok) assert.equal(c.alert.alertLevel, COST_ALERT_LEVEL.CRITICAL);

  const u = await getDishCostAlert(actor, unresolved.id);
  assert.equal(u.ok, true);
  if (u.ok) assert.equal(u.alert.alertLevel, COST_ALERT_LEVEL.UNRESOLVED);
  pass("DB dishes classify healthy/warning/critical/unresolved");

  // Price change moves status
  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { referencePrice: 4 },
  });
  const afterPrice = await getDishCostAlert(actor, healthy.id);
  // 0.5 * 4 = 2 / 10 = 20% still healthy
  assert.equal(afterPrice.ok, true);
  if (afterPrice.ok) {
    assert.equal(afterPrice.alert.alertLevel, COST_ALERT_LEVEL.HEALTHY);
    assert.equal(afterPrice.alert.dishCost, 2);
  }

  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { referencePrice: 7 },
  });
  // 0.5 * 7 = 3.5 / 10 = 35% → critical
  const afterCritical = await getDishCostAlert(actor, healthy.id);
  assert.equal(afterCritical.ok, true);
  if (afterCritical.ok) {
    assert.equal(afterCritical.alert.alertLevel, COST_ALERT_LEVEL.CRITICAL);
  }
  pass("ingredient price change updates alert");

  await prisma.dish.update({
    where: { id: healthy.id },
    data: { sellingPrice: 20 },
  });
  // 3.5 / 20 = 17.5% → healthy
  const afterSell = await getDishCostAlert(actor, healthy.id);
  assert.equal(afterSell.ok, true);
  if (afterSell.ok) {
    assert.equal(afterSell.alert.alertLevel, COST_ALERT_LEVEL.HEALTHY);
    assert.equal(afterSell.alert.sellingPrice, 20);
  }
  pass("selling price change updates alert; no auto price edit");

  await prisma.dishIngredient.updateMany({
    where: { dishId: healthy.id },
    data: { quantity: 2000 },
  });
  // 2L * 7 = 14 / 20 = 70% critical
  const afterRecipe = await getDishCostAlert(actor, healthy.id);
  assert.equal(afterRecipe.ok, true);
  if (afterRecipe.ok) {
    assert.equal(afterRecipe.alert.alertLevel, COST_ALERT_LEVEL.CRITICAL);
  }
  pass("recipe change updates alert");

  const list = await listDishCostAlerts(actor, { attentionOnly: true });
  assert.ok(list.alerts.every((a) => a.alertLevel !== COST_ALERT_LEVEL.HEALTHY));
  assert.ok(list.alerts.every((a) => a.scopeLabel === "Group"));
  pass("attention list excludes healthy; scope is Group");

  // Selling prices unchanged by alert calculation
  const dishRow = await prisma.dish.findUniqueOrThrow({
    where: { id: healthy.id },
  });
  assert.equal(dishRow.sellingPrice, 20);

  assert.equal(await prisma.stockMovement.count(), beforeMovements);
  assert.equal(await prisma.outletStock.count(), beforeStock);
  pass("alerts do not touch stock or movements");

  // cleanup
  await prisma.dishIngredient.deleteMany({
    where: {
      dishId: { in: [healthy.id, warning.id, critical.id, unresolved.id] },
    },
  });
  await prisma.dish.deleteMany({
    where: {
      id: { in: [healthy.id, warning.id, critical.id, unresolved.id] },
    },
  });
  await prisma.inventoryItem.delete({ where: { id: item.id } });

  // restore defaults
  await updateFoodCostThresholds(
    { id: "sa", role: "SUPER_ADMIN", outletId: null },
    30,
    35,
  );
}

dbChecks()
  .then(() => {
    console.log("\nAll cost alert tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
