import assert from "node:assert/strict";
import { convertQuantity, toStockQuantity } from "../src/lib/units";

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

// Mass
{
  const r = convertQuantity(100, "g", "kg");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 0.1);
  pass("100g → 0.1kg");
}
{
  const r = convertQuantity(1.5, "kg", "g");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 1500);
  pass("1.5kg → 1500g");
}

// Volume
{
  const r = convertQuantity(250, "ml", "litre");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 0.25);
  pass("250ml → 0.25 litre");
}
{
  const r = convertQuantity(2, "L", "ml");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 2000);
  pass("2L → 2000ml");
}

// Same discrete unit
{
  const r = convertQuantity(3, "bottle", "bottle");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 3);
  pass("bottle → bottle");
}

// Incompatible without pack
{
  const r = convertQuantity(6, "unit", "box");
  assert.equal(r.ok, false);
  pass("unit → box rejected without pack size");
}

// Pack bridge
{
  const r = toStockQuantity(6, "unit", "box", { unitsPerStockUnit: 12 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 0.5);
  pass("6 unit → 0.5 box with pack 12");
}
{
  const r = toStockQuantity(1, "box", "unit", { unitsPerStockUnit: 12 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quantity, 12);
  pass("1 box → 12 unit with pack 12");
}

// Reject bottle ↔ kg
{
  const r = convertQuantity(1, "bottle", "kg");
  assert.equal(r.ok, false);
  pass("bottle → kg rejected");
}

// Zero / negative handled by convert (negative rejected; zero allowed for convert)
{
  const r = convertQuantity(-1, "g", "kg");
  assert.equal(r.ok, false);
  pass("negative quantity rejected");
}

console.log("\nAll unit conversion tests passed.");
