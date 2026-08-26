/**
 * Verification checks for the two things most likely to be wrong in a
 * stock-take system: label matching, and outlet access control.
 *
 *   npx tsx scripts/verify.ts http://localhost:3111
 */
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";

import { prisma } from "../src/lib/db";
import { matchDetectedItem } from "../src/lib/matching";
import { nextStockTakeReference } from "../src/lib/stock";

const BASE = process.argv[2] ?? "http://localhost:3111";

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function sign(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + 3_600_000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

async function testMatching() {
  console.log("\nLabel matching (what the vision model would return)");

  const items = await prisma.inventoryItem.findMany({
    select: { id: true, sku: true, name: true, brand: true, aliases: true },
  });
  const bySku = new Map(items.map((item) => [item.sku, item.id]));

  // Realistic messy labels a model might read off a shelf.
  const cases: [string, string | null][] = [
    ["Oatly Barista oat milk 1L", "DAI-002"],
    ["oat milk", "DAI-002"],
    ["Cisk lager bottle", "BEE-001"],
    ["free range eggs", "DAI-009"],
    ["Hass avocado", "FRV-001"],
    ["Aperol", "SPI-005"],
    ["kinnie", "SOF-001"],
    ["san pellegrino sparkling water", "SOF-003"],
    ["house blend coffee beans", "COF-001"],
    ["tribe tote bag", "MER-002"],
    ["a completely unknown artisanal thing", null],
  ];

  for (const [label, expectedSku] of cases) {
    const match = matchDetectedItem({ sku: null, label }, items);
    const expectedId = expectedSku ? bySku.get(expectedSku) : null;

    if (expectedSku === null) {
      check(`"${label}" → no match`, match === null, match ? "matched anyway" : "");
    } else {
      const actual = items.find((item) => item.id === match?.itemId);
      check(
        `"${label}" → ${expectedSku}`,
        match?.itemId === expectedId,
        match
          ? `got ${actual?.sku} (${match.reason}, ${match.score.toFixed(2)})`
          : "no match found",
      );
    }
  }
}

async function testAccessControl() {
  console.log("\nOutlet access control");

  const outlets = await prisma.outlet.findMany({ orderBy: { name: "asc" } });
  const [outletA, outletB] = outlets;

  const adminA = await prisma.user.findFirst({
    where: { role: "OUTLET_ADMIN", outletId: outletA.id },
  });
  const superAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (!adminA || !superAdmin) throw new Error("Seed the database first.");

  // A draft belonging to outlet B.
  const draftB = await prisma.stockTake.create({
    data: {
      reference: await nextStockTakeReference(),
      outletId: outletB.id,
      userId: superAdmin.id,
      note: "Access control fixture",
    },
  });

  const bytes = await readFile("public/brand/tribe-eye.png");
  function body() {
    const form = new FormData();
    form.append(
      "photo",
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      "shelf.png",
    );
    return form;
  }

  const url = `${BASE}/api/stock-takes/${draftB.id}/photos`;

  const anonymous = await fetch(url, { method: "POST", body: body() });
  check(
    "unauthenticated upload rejected",
    anonymous.status === 401,
    `got ${anonymous.status}`,
  );

  const wrongOutlet = await fetch(url, {
    method: "POST",
    body: body(),
    headers: { cookie: `tribe_session=${await sign(adminA.id)}` },
  });
  check(
    `${outletA.name} admin blocked from ${outletB.name} count`,
    wrongOutlet.status === 403,
    `got ${wrongOutlet.status}`,
  );

  const allowed = await fetch(url, {
    method: "POST",
    body: body(),
    headers: { cookie: `tribe_session=${await sign(superAdmin.id)}` },
  });
  check(
    "super admin allowed on any outlet",
    allowed.status === 200,
    `got ${allowed.status}`,
  );

  const forged = await fetch(url, {
    method: "POST",
    body: body(),
    headers: { cookie: "tribe_session=not-a-real-token" },
  });
  check("forged session token rejected", forged.status === 401, `got ${forged.status}`);

  await prisma.stockTake.delete({ where: { id: draftB.id } });

  // Submitted counts must be immutable.
  const submitted = await prisma.stockTake.findFirst({
    where: { status: "SUBMITTED" },
  });
  if (submitted) {
    const closed = await fetch(
      `${BASE}/api/stock-takes/${submitted.id}/photos`,
      {
        method: "POST",
        body: body(),
        headers: { cookie: `tribe_session=${await sign(superAdmin.id)}` },
      },
    );
    check(
      "cannot add photos to a submitted count",
      closed.status === 409,
      `got ${closed.status}`,
    );
  }
}

async function main() {
  await testMatching();
  await testAccessControl();

  console.log(
    `\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`,
  );
  if (failures > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nVERIFY FAILED:", error);
    process.exit(1);
  });
