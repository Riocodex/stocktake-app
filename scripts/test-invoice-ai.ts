import assert from "node:assert/strict";

import {
  INVOICE_STATUS,
  INVOICE_TOTAL_TOLERANCE_EUR,
} from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import {
  normaliseInvoiceExtraction,
  simulateInvoiceExtraction,
  type InvoiceExtractionResult,
} from "../src/lib/invoice-ai";
import {
  INVOICE_ALLOWED_MIME,
  INVOICE_MAX_BYTES,
  validateInvoiceUploadMeta,
} from "../src/lib/invoice-storage";
import {
  InvoiceError,
  confirmInvoice,
  getInvoiceFile,
  reconcileInvoiceTotals,
  updateInvoiceDraft,
  uploadInvoice,
} from "../src/lib/invoices";

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
    assert.ok(error instanceof InvoiceError, `${label}: not InvoiceError`);
    if (status !== undefined) {
      assert.equal(error.status, status, `${label}: status ${error.message}`);
    }
  }
  pass(label);
}

{
  assert.equal(validateInvoiceUploadMeta("image/jpeg", 100).ok, true);
  assert.equal(validateInvoiceUploadMeta("application/pdf", 100).ok, true);
  assert.equal(validateInvoiceUploadMeta("text/plain", 100).ok, false);
  assert.equal(validateInvoiceUploadMeta("image/png", 0).ok, false);
  assert.equal(
    validateInvoiceUploadMeta("image/png", INVOICE_MAX_BYTES + 1).ok,
    false,
  );
  assert.ok(INVOICE_ALLOWED_MIME.has("image/heic"));
  pass("supported upload / invalid type / size enforcement");
}

{
  const sparse = normaliseInvoiceExtraction({
    supplierName: null,
    invoiceNumber: "",
    total: "not-a-number",
    lines: [{ rawDescription: "Milk 1L", quantity: 2, unitPrice: 1.5 }],
  });
  assert.equal(sparse.supplierName, null);
  assert.equal(sparse.invoiceNumber, null);
  assert.equal(sparse.total, null);
  assert.equal(sparse.lines.length, 1);
  assert.equal(sparse.lines[0]?.lineTotal, 3);
  pass("extraction normalisation + missing fields + line total fill");
}

{
  const multi = normaliseInvoiceExtraction({
    currency: "eur",
    subtotal: 10,
    vatAmount: 1.8,
    total: 11.8,
    lines: [
      { rawDescription: "A", quantity: 1, unitPrice: 4, lineTotal: 4 },
      { rawDescription: "B", quantity: 2, unitPrice: 3, lineTotal: 6 },
      { quantity: 1 }, // no description → dropped
    ],
  });
  assert.equal(multi.currency, "EUR");
  assert.equal(multi.lines.length, 2);
  pass("multiple invoice lines; junk lines dropped");
}

{
  const ok = reconcileInvoiceTotals({
    subtotal: 10,
    vatAmount: 1.8,
    total: 11.8,
    lines: [{ lineTotal: 10, quantity: 1, unitPrice: 10 }],
  });
  // line sum 10 vs total 11.8 → mismatch (VAT/shipping)
  assert.equal(ok.ok, false);
  assert.ok(ok.issues.some((i) => i.code === "TOTAL_MISMATCH"));

  const tight = reconcileInvoiceTotals({
    subtotal: 10,
    vatAmount: 0,
    total: 10,
    lines: [{ lineTotal: 10.02, quantity: 1, unitPrice: 10 }],
  });
  // 0.02 within default tolerance 0.05
  assert.ok(INVOICE_TOTAL_TOLERANCE_EUR >= 0.05);
  assert.equal(tight.ok, true);

  const neg = reconcileInvoiceTotals({
    subtotal: null,
    vatAmount: null,
    total: 5,
    lines: [{ lineTotal: -1, quantity: 1, unitPrice: -1 }],
  });
  assert.ok(neg.issues.some((i) => i.code === "NEGATIVE_LINE" || i.code === "NEGATIVE_PRICE"));
  pass("total reconciliation + VAT/discount style mismatches");
}

async function main() {
  const beforeMovements = await prisma.stockMovement.count();
  const beforeDeliveries = await prisma.delivery.count();
  const priceSnap = await prisma.inventoryItem.findMany({
    take: 5,
    select: { id: true, referencePrice: true },
  });

  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    take: 2,
  });
  while (outlets.length < 2) {
    outlets.push(
      await prisma.outlet.create({
        data: {
          name: `Inv Outlet ${outlets.length + 1}`,
          slug: `inv-out-${Date.now()}-${outlets.length}`,
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
        email: `super-inv-${Date.now()}@test.local`,
        name: "Super Inv",
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
        email: `oa-inv-${Date.now()}@test.local`,
        name: "OA Inv",
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
      data: { name: "Inv Cat", sortOrder: 990, area: "BOTH" },
    }));

  const tomatoes = await prisma.inventoryItem.create({
    data: {
      sku: `INV-TOM-${Date.now()}`,
      name: "Tomatoes vine",
      categoryId: category.id,
      unit: "kg",
      referencePrice: 2.4,
      aliases: "tomatoes vine 5kg crate",
      isActive: true,
    },
  });

  const mockExtract: InvoiceExtractionResult = {
    provider: "test-mock",
    data: normaliseInvoiceExtraction({
      supplierName: "Fresh Farm Ltd",
      supplierVat: "MT123",
      invoiceNumber: `INV-TEST-${Date.now()}`,
      invoiceDate: "2026-04-01",
      currency: "EUR",
      subtotal: 25,
      vatAmount: 4.5,
      total: 29.5,
      lines: [
        {
          rawDescription: "Tomatoes vine 5kg crate",
          quantity: 2,
          unit: "crate",
          unitPrice: 12.5,
          lineTotal: 25,
          vatRate: null,
          vatAmount: null,
          needsReview: false,
        },
        {
          rawDescription: "Mystery garnish XYZ-99",
          quantity: 1,
          unit: "pack",
          unitPrice: 0,
          lineTotal: 0,
          needsReview: true,
        },
      ],
    }),
    raw: { mocked: true },
  };

  const bytes = new TextEncoder().encode(`invoice-bytes-${Date.now()}`);

  await expectReject(
    "OUTLET_ADMIN cannot upload for another outlet",
    () =>
      uploadInvoice(oaActor, {
        outletId: outletB.id,
        bytes,
        mimeType: "image/jpeg",
        extractor: async () => mockExtract,
      }),
    403,
  );

  const uploaded = await uploadInvoice(oaActor, {
    outletId: outletA.id,
    bytes,
    mimeType: "image/jpeg",
    originalName: "test-invoice.jpg",
    extractor: async () => mockExtract,
  });
  assert.ok(
    uploaded.invoice.status === INVOICE_STATUS.NEEDS_REVIEW ||
      uploaded.invoice.status === INVOICE_STATUS.EXTRACTED,
  );
  assert.equal(uploaded.invoice.lines.length, 2);
  const matched = uploaded.invoice.lines.find((l) =>
    l.rawDescription.includes("Tomatoes"),
  );
  assert.ok(matched);
  assert.ok(
    matched!.itemId === tomatoes.id ||
      matched!.matchStatus === "SUGGESTED" ||
      matched!.matchStatus === "MATCHED",
  );
  const unmatched = uploaded.invoice.lines.find((l) =>
    l.rawDescription.includes("Mystery"),
  );
  assert.ok(unmatched);
  assert.equal(unmatched!.itemId, null);
  pass("upload + item matching + ambiguous/unmatched preserved");

  // Manual correction
  const corrected = await updateInvoiceDraft(oaActor, uploaded.invoice.id, {
    invoiceNumber: mockExtract.data.invoiceNumber,
    total: 29.5,
    lines: [
      {
        rawDescription: "Tomatoes vine 5kg crate",
        itemId: tomatoes.id,
        quantity: 2,
        unit: "crate",
        unitPrice: 12.5,
        lineTotal: 25,
        needsReview: false,
      },
      {
        rawDescription: "Mystery garnish XYZ-99",
        itemId: null,
        quantity: 1,
        unit: "pack",
        unitPrice: 0,
        lineTotal: 0,
        needsReview: true,
      },
    ],
  });
  assert.equal(
    corrected.invoice.lines.find((l) => l.itemId === tomatoes.id)?.matchStatus,
    "MATCHED",
  );
  pass("manual field corrections + match");

  // Duplicate detection
  const dup = await uploadInvoice(superActor, {
    outletId: outletA.id,
    bytes: new TextEncoder().encode(`dup-${Date.now()}`),
    mimeType: "image/jpeg",
    extractor: async () => mockExtract,
  });
  assert.ok(dup.duplicates.length >= 1);
  pass("duplicate invoice detection");

  await expectReject(
    "confirm without acknowledging duplicate",
    () => confirmInvoice(superActor, dup.invoice.id),
    409,
  );

  // SUPER_ADMIN access to OA invoice file
  const file = await getInvoiceFile(superActor, uploaded.invoice.id);
  assert.ok(file.bytes.length > 0);
  pass("SUPER_ADMIN file access");

  {
    const other = await uploadInvoice(superActor, {
      outletId: outletB.id,
      bytes: new TextEncoder().encode(`other2-${Date.now()}`),
      mimeType: "image/png",
      extractor: async () => ({
        ...mockExtract,
        data: {
          ...mockExtract.data,
          invoiceNumber: `OTHER2-${Date.now()}`,
        },
      }),
    });
    await expectReject(
      "OUTLET_ADMIN cannot read other outlet file",
      () => getInvoiceFile(oaActor, other.invoice.id),
      403,
    );
  }

  const confirmed = await confirmInvoice(oaActor, uploaded.invoice.id, {
    acknowledgeDuplicates: true,
  });
  assert.equal(confirmed.invoice.status, INVOICE_STATUS.CONFIRMED);
  assert.equal(confirmed.stockChanged, false);
  assert.equal(confirmed.deliveryCreated, false);
  assert.equal(confirmed.pricesChanged, false);
  pass("confirmed invoice persistence without side-effect flags");

  await expectReject(
    "cannot edit confirmed",
    () =>
      updateInvoiceDraft(oaActor, uploaded.invoice.id, { total: 99 }),
    400,
  );

  // Retry / error handling
  await expectReject(
    "extractor failure → FAILED path",
    () =>
      uploadInvoice(oaActor, {
        bytes: new TextEncoder().encode(`fail-${Date.now()}`),
        mimeType: "image/jpeg",
        extractor: async () => {
          throw new Error("boom extract");
        },
      }),
    400,
  );
  pass("retry/error handling (failed extraction)");

  const afterMovements = await prisma.stockMovement.count();
  const afterDeliveries = await prisma.delivery.count();
  assert.equal(afterMovements, beforeMovements);
  assert.equal(afterDeliveries, beforeDeliveries);

  for (const snap of priceSnap) {
    const fresh = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: snap.id },
    });
    assert.equal(fresh.referencePrice, snap.referencePrice);
  }
  const tomatoFresh = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: tomatoes.id },
  });
  assert.equal(tomatoFresh.referencePrice, 2.4);
  pass("no stock movements, deliveries, or referencePrice changes");

  // Simulated extractor still returns structured data
  const sim = simulateInvoiceExtraction(bytes);
  assert.equal(sim.provider, "simulated");
  assert.ok(sim.data.lines.length >= 1);
  pass("simulated extractor works offline");

  // Existing delivery workflow still callable (create delivery directly)
  await prisma.delivery.create({
    data: {
      outletId: outletA.id,
      userId: oa.id,
      note: "invoice-ai regression smoke",
      lines: {
        create: [{ itemId: tomatoes.id, quantity: 0.01 }],
      },
    },
  });
  // Roll back the tiny delivery stock effect by not updating stock —
  // delivery create alone doesn't update stock without recordDeliveryAction.
  pass("existing delivery model remains usable");

  console.log("\nAll invoice AI tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
