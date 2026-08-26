/**
 * End-to-end check of the AI photo analysis pipeline.
 *
 * Creates a draft stock take, signs a session cookie, posts an image to the
 * upload route exactly as the browser would, then reports what was written to
 * the database. Run against a dev server:
 *
 *   npx tsx scripts/e2e-photo-test.ts http://localhost:3111
 */
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";

import { prisma } from "../src/lib/db";
import { nextStockTakeReference } from "../src/lib/stock";

const BASE = process.argv[2] ?? "http://localhost:3111";
const IMAGE = process.argv[3] ?? "public/brand/tribe-eye.png";

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });
  const outlet = await prisma.outlet.findFirst({ orderBy: { name: "asc" } });

  if (!user || !outlet) throw new Error("Seed the database first.");

  const stockTake = await prisma.stockTake.create({
    data: {
      reference: await nextStockTakeReference(),
      outletId: outlet.id,
      userId: user.id,
      note: "Automated pipeline test",
    },
  });

  console.log(`Draft ${stockTake.reference} for ${outlet.name}`);

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + 3_600_000))
    .sign(secret);

  const bytes = await readFile(IMAGE);
  const form = new FormData();
  form.append(
    "photo",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    "shelf.png",
  );

  const response = await fetch(
    `${BASE}/api/stock-takes/${stockTake.id}/photos`,
    { method: "POST", body: form, headers: { cookie: `tribe_session=${token}` } },
  );

  const payload = await response.json();
  console.log(`\nPOST /photos → ${response.status}`);
  console.log(JSON.stringify(payload, null, 2));

  if (!response.ok) {
    throw new Error("Upload failed.");
  }

  const lines = await prisma.stockTakeLine.findMany({
    where: { stockTakeId: stockTake.id },
    include: { item: { select: { name: true, sku: true, unit: true } } },
  });

  console.log(`\n${lines.length} draft lines created:`);
  for (const line of lines) {
    console.log(
      `  ${line.item.sku.padEnd(9)} ${line.item.name.padEnd(28)} ` +
        `counted=${String(line.countedQty).padStart(5)} ${line.item.unit.padEnd(7)} ` +
        `was=${String(line.previousQty).padStart(5)} ` +
        `price=${line.unitPrice.toFixed(2).padStart(6)} ` +
        `conf=${line.confidence ?? "-"}`,
    );
  }

  const detections = await prisma.photoDetection.findMany({
    where: { stockTakeId: stockTake.id },
  });
  const unmatched = detections.filter((row) => row.status === "UNMATCHED");
  console.log(
    `\n${detections.length} detections recorded (${unmatched.length} unmatched)`,
  );

  // Verify the submit path applies counts to live stock.
  const before = await prisma.outletStock.findUnique({
    where: {
      outletId_itemId: { outletId: outlet.id, itemId: lines[0].itemId },
    },
  });

  const { submitStockTake } = await import("../src/lib/stock");
  await submitStockTake(stockTake.id);

  const after = await prisma.outletStock.findUnique({
    where: {
      outletId_itemId: { outletId: outlet.id, itemId: lines[0].itemId },
    },
  });

  console.log(
    `\nSubmit applied: ${lines[0].item.name} ` +
      `${before?.quantity ?? 0} → ${after?.quantity} ` +
      `(line counted ${lines[0].countedQty})`,
  );

  const reloaded = await prisma.stockTake.findUnique({
    where: { id: stockTake.id },
  });
  console.log(`Status now: ${reloaded?.status}`);

  const ok =
    after?.quantity === lines[0].countedQty && reloaded?.status === "SUBMITTED";
  console.log(`\n${ok ? "PASS" : "FAIL"}: submit wrote counted figures to live stock`);

  // Leave the database as we found it.
  await prisma.stockTake.delete({ where: { id: stockTake.id } });
  console.log("Cleaned up test stock take.");

  if (!ok) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nE2E FAILED:", error);
    process.exit(1);
  });
