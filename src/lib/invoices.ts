import {
  INVOICE_LINE_MATCH,
  INVOICE_STATUS,
  INVOICE_TOTAL_TOLERANCE_EUR,
  ROLES,
  type InvoiceLineMatchStatus,
  type InvoiceStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  defaultInvoiceExtractor,
  normaliseInvoiceExtraction,
  type ExtractedInvoice,
  type InvoiceExtractor,
  type InvoiceExtractionResult,
} from "@/lib/invoice-ai";
import {
  readInvoiceDocument,
  saveInvoiceDocument,
  validateInvoiceUploadMeta,
} from "@/lib/invoice-storage";
import { matchDetectedItem, normalise, type MatchCandidate } from "@/lib/matching";
import { roundEuros } from "@/lib/money";

export type InvoiceActor = {
  id: string;
  role: string;
  outletId: string | null;
};

export class InvoiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function isSuper(user: InvoiceActor) {
  return user.role === ROLES.SUPER_ADMIN;
}

function assertOutletAccess(user: InvoiceActor, outletId: string) {
  if (isSuper(user)) return;
  if (user.outletId !== outletId) {
    throw new InvoiceError(403, "You do not have access to this outlet.");
  }
}

function resolveOutletId(
  user: InvoiceActor,
  requested?: string | null,
): string {
  if (isSuper(user)) {
    const id = String(requested ?? "").trim();
    if (!id) throw new InvoiceError(400, "Choose which outlet this invoice is for.");
    return id;
  }
  if (!user.outletId) {
    throw new InvoiceError(403, "Your account is not assigned to an outlet.");
  }
  if (requested && requested !== user.outletId) {
    throw new InvoiceError(403, "You cannot upload invoices for another outlet.");
  }
  return user.outletId;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value.trim());
  if (!iso) return null;
  const date = new Date(`${iso[0]}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export type ReconciliationIssue = {
  code: string;
  message: string;
};

export function reconcileInvoiceTotals(input: {
  subtotal: number | null;
  vatAmount: number | null;
  total: number | null;
  lines: Array<{ lineTotal: number | null; quantity: number | null; unitPrice: number | null }>;
}): { ok: boolean; issues: ReconciliationIssue[]; lineSum: number | null } {
  const issues: ReconciliationIssue[] = [];
  let lineSum = 0;
  let anyLine = false;

  for (const line of input.lines) {
    let total = line.lineTotal;
    if (
      total === null &&
      line.quantity !== null &&
      line.unitPrice !== null
    ) {
      total = roundEuros(line.quantity * line.unitPrice);
    }
    if (total === null) continue;
    if (total < 0) {
      issues.push({
        code: "NEGATIVE_LINE",
        message: "A line total is negative — check for credit notes.",
      });
    }
    lineSum += total;
    anyLine = true;
  }

  const roundedLineSum = anyLine ? roundEuros(lineSum) : null;

  if (
    input.total !== null &&
    roundedLineSum !== null &&
    Math.abs(input.total - roundedLineSum) > INVOICE_TOTAL_TOLERANCE_EUR
  ) {
    issues.push({
      code: "TOTAL_MISMATCH",
      message: `Header total (€${input.total.toFixed(2)}) differs from line sum (€${roundedLineSum.toFixed(2)}). Shipping, discounts or VAT may explain this — review before confirming.`,
    });
  }

  if (
    input.subtotal !== null &&
    input.vatAmount !== null &&
    input.total !== null
  ) {
    const expected = roundEuros(input.subtotal + input.vatAmount);
    if (Math.abs(expected - input.total) > INVOICE_TOTAL_TOLERANCE_EUR) {
      issues.push({
        code: "VAT_RECONCILE",
        message: `Subtotal + VAT (€${expected.toFixed(2)}) does not equal total (€${input.total.toFixed(2)}).`,
      });
    }
  }

  for (const line of input.lines) {
    if (line.quantity !== null && line.quantity < 0) {
      issues.push({
        code: "NEGATIVE_QTY",
        message: "A quantity is negative.",
      });
      break;
    }
    if (line.unitPrice !== null && line.unitPrice < 0) {
      issues.push({
        code: "NEGATIVE_PRICE",
        message: "A unit price is negative.",
      });
      break;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    lineSum: roundedLineSum,
  };
}

export async function findDuplicateInvoices(input: {
  outletId: string;
  invoiceNumber: string | null | undefined;
  invoiceDate: Date | null | undefined;
  supplierId: string | null | undefined;
  supplierTextRaw: string | null | undefined;
  excludeId?: string;
}) {
  const number = String(input.invoiceNumber ?? "").trim();
  if (!number) {
    // Missing invoice numbers are not proof of uniqueness — skip hard match.
    return [];
  }

  const date = dateKey(input.invoiceDate);
  const supplierNorm = normalise(input.supplierTextRaw ?? "");

  const candidates = await prisma.invoice.findMany({
    where: {
      outletId: input.outletId,
      invoiceNumber: number,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      status: { not: INVOICE_STATUS.FAILED },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      outlet: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return candidates.filter((row) => {
    const sameDate =
      !date || !row.invoiceDate || dateKey(row.invoiceDate) === date;
    if (!sameDate) return false;

    if (input.supplierId && row.supplierId && input.supplierId === row.supplierId) {
      return true;
    }
    if (
      supplierNorm &&
      row.supplierTextRaw &&
      normalise(row.supplierTextRaw) === supplierNorm
    ) {
      return true;
    }
    // Same number + date at outlet with no supplier info still warn.
    if (!input.supplierId && !supplierNorm) return Boolean(date);
    if (!row.supplierId && !row.supplierTextRaw) return Boolean(date);
    return false;
  });
}

async function matchSupplierId(supplierText: string | null) {
  if (!supplierText) return null;
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const target = normalise(supplierText);
  if (!target) return null;

  const exact = suppliers.find((s) => normalise(s.name) === target);
  if (exact) return exact.id;

  const partial = suppliers.find(
    (s) =>
      normalise(s.name).includes(target) || target.includes(normalise(s.name)),
  );
  // Only accept partial when both sides are reasonably long to avoid "co" matches.
  if (partial && target.length >= 4 && normalise(partial.name).length >= 4) {
    return partial.id;
  }
  return null;
}

async function catalogueCandidates(): Promise<MatchCandidate[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      aliases: true,
    },
  });
  return items;
}

function applyLineMatching(
  lines: ExtractedInvoice["lines"],
  candidates: MatchCandidate[],
) {
  return lines.map((line, index) => {
    const match = matchDetectedItem(
      { sku: null, label: line.rawDescription },
      candidates,
      0.55,
    );
    // Ambiguous: second-best within 0.08 of best → leave unmatched.
    let ambiguous = false;
    if (match && match.reason === "fuzzy") {
      const scores = candidates
        .map((c) => {
          const m = matchDetectedItem(
            { sku: null, label: line.rawDescription },
            [c],
            0,
          );
          return m?.score ?? 0;
        })
        .sort((a, b) => b - a);
      if (scores.length >= 2 && scores[0]! - scores[1]! < 0.08 && scores[1]! >= 0.45) {
        ambiguous = true;
      }
    }

    if (!match || ambiguous) {
      return {
        rawDescription: line.rawDescription,
        itemId: null as string | null,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        vatRate: line.vatRate,
        vatAmount: line.vatAmount,
        matchStatus: INVOICE_LINE_MATCH.UNMATCHED as InvoiceLineMatchStatus,
        matchConfidence: match?.score ?? null,
        needsReview: true,
        sortOrder: index,
      };
    }

    const suggested = match.score < 0.92;
    return {
      rawDescription: line.rawDescription,
      itemId: match.itemId,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      matchStatus: (suggested
        ? INVOICE_LINE_MATCH.SUGGESTED
        : INVOICE_LINE_MATCH.MATCHED) as InvoiceLineMatchStatus,
      matchConfidence: match.score,
      needsReview: suggested || line.needsReview,
      sortOrder: index,
    };
  });
}

function needsReviewStatus(
  data: ExtractedInvoice,
  matchedLines: ReturnType<typeof applyLineMatching>,
  reconciliation: ReturnType<typeof reconcileInvoiceTotals>,
): InvoiceStatus {
  if (
    !data.invoiceNumber ||
    !data.total ||
    matchedLines.some((l) => l.needsReview || l.matchStatus === INVOICE_LINE_MATCH.UNMATCHED) ||
    !reconciliation.ok
  ) {
    return INVOICE_STATUS.NEEDS_REVIEW;
  }
  return INVOICE_STATUS.EXTRACTED;
}

const invoiceInclude = {
  outlet: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true, isSample: true } },
  uploadedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      item: { select: { id: true, name: true, sku: true, unit: true } },
    },
  },
};

export async function listInvoices(
  user: InvoiceActor,
  options?: { outletId?: string | null; status?: string | null },
) {
  const scope = isSuper(user)
    ? options?.outletId ?? null
    : user.outletId;
  if (!isSuper(user) && !scope) {
    throw new InvoiceError(403, "Your account is not assigned to an outlet.");
  }

  return prisma.invoice.findMany({
    where: {
      ...(scope ? { outletId: scope } : {}),
      ...(options?.status ? { status: options.status } : {}),
    },
    include: {
      outlet: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvoice(user: InvoiceActor, invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: invoiceInclude,
  });
  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);

  const duplicates = await findDuplicateInvoices({
    outletId: invoice.outletId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    supplierId: invoice.supplierId,
    supplierTextRaw: invoice.supplierTextRaw,
    excludeId: invoice.id,
  });

  const reconciliation = reconcileInvoiceTotals({
    subtotal: invoice.subtotal,
    vatAmount: invoice.vatAmount,
    total: invoice.total,
    lines: invoice.lines,
  });

  return { invoice, duplicates, reconciliation };
}

export async function getInvoiceFile(user: InvoiceActor, invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      outletId: true,
      fileKey: true,
      fileMimeType: true,
      fileName: true,
    },
  });
  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);

  const bytes = await readInvoiceDocument(invoice.fileKey);
  return {
    bytes,
    mimeType: invoice.fileMimeType,
    fileName: invoice.fileName ?? invoice.fileKey,
  };
}

export async function uploadInvoice(
  user: InvoiceActor,
  input: {
    outletId?: string | null;
    bytes: Uint8Array;
    mimeType: string;
    originalName?: string | null;
    extractor?: InvoiceExtractor;
  },
) {
  const outletId = resolveOutletId(user, input.outletId);
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || !outlet.isActive) {
    throw new InvoiceError(400, "That outlet is not available.");
  }

  const meta = validateInvoiceUploadMeta(input.mimeType, input.bytes.length);
  if (!meta.ok) throw new InvoiceError(400, meta.error);

  const stored = await saveInvoiceDocument({
    bytes: input.bytes,
    mimeType: meta.mime,
    originalName: input.originalName,
  });

  const created = await prisma.invoice.create({
    data: {
      outletId,
      status: INVOICE_STATUS.UPLOADED,
      fileKey: stored.fileKey,
      fileMimeType: stored.fileMimeType,
      fileName: stored.fileName,
      uploadedById: user.id,
      currency: "EUR",
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId,
      action: "INVOICE_UPLOADED",
      detail: stored.fileName ?? stored.fileKey,
    },
  });

  return runExtraction(user, created.id, input.extractor);
}

export async function runExtraction(
  user: InvoiceActor,
  invoiceId: string,
  extractor: InvoiceExtractor = defaultInvoiceExtractor,
) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, invoice.outletId);

  if (invoice.status === INVOICE_STATUS.CONFIRMED) {
    throw new InvoiceError(400, "Confirmed invoices cannot be re-extracted.");
  }

  let result: InvoiceExtractionResult;
  try {
    const bytes = await readInvoiceDocument(invoice.fileKey);
    result = await extractor(bytes, invoice.fileMimeType);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Extraction failed.";
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: INVOICE_STATUS.FAILED,
        extractionError: message.slice(0, 500),
        extractionProvider: "error",
      },
    });
    throw new InvoiceError(400, message);
  }

  const data = normaliseInvoiceExtraction(result.data);
  const candidates = await catalogueCandidates();
  const matchedLines = applyLineMatching(data.lines, candidates);
  const supplierId = await matchSupplierId(data.supplierName);
  const reconciliation = reconcileInvoiceTotals({
    subtotal: data.subtotal,
    vatAmount: data.vatAmount,
    total: data.total,
    lines: matchedLines,
  });
  const status = needsReviewStatus(data, matchedLines, reconciliation);

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        supplierId,
        supplierTextRaw: data.supplierName,
        supplierVatRaw: data.supplierVat,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: parseDateOnly(data.invoiceDate),
        deliveryDate: parseDateOnly(data.deliveryDate),
        currency: data.currency || "EUR",
        subtotal: data.subtotal,
        vatAmount: data.vatAmount,
        total: data.total,
        extractedSubtotal: data.subtotal,
        extractedVatAmount: data.vatAmount,
        extractedTotal: data.total,
        extractionProvider: result.provider,
        extractionRaw: JSON.stringify(result.raw).slice(0, 50_000),
        extractionError: null,
        lines: {
          create: matchedLines.map((line) => ({
            rawDescription: line.rawDescription,
            itemId: line.itemId,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            vatRate: line.vatRate,
            vatAmount: line.vatAmount,
            matchStatus: line.matchStatus,
            matchConfidence: line.matchConfidence,
            needsReview: line.needsReview,
            sortOrder: line.sortOrder,
          })),
        },
      },
    });

    await tx.activityLog.create({
      data: {
        userId: user.id,
        outletId: invoice.outletId,
        action: "INVOICE_EXTRACTED",
        detail: `${status} · ${matchedLines.length} lines · ${result.provider}`,
      },
    });
  });

  return getInvoice(user, invoiceId);
}

export type InvoiceLineInput = {
  id?: string;
  rawDescription: string;
  itemId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  vatRate?: number | null;
  vatAmount?: number | null;
  matchStatus?: string;
  needsReview?: boolean;
  excludeFromReceiving?: boolean;
};

export async function updateInvoiceDraft(
  user: InvoiceActor,
  invoiceId: string,
  input: {
    outletId?: string | null;
    supplierId?: string | null;
    supplierTextRaw?: string | null;
    supplierVatRaw?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    deliveryDate?: string | null;
    currency?: string | null;
    subtotal?: number | null;
    vatAmount?: number | null;
    total?: number | null;
    lines?: InvoiceLineInput[];
  },
) {
  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!existing) throw new InvoiceError(404, "Invoice not found.");
  assertOutletAccess(user, existing.outletId);

  if (existing.status === INVOICE_STATUS.CONFIRMED) {
    throw new InvoiceError(400, "Confirmed invoices cannot be edited in this step.");
  }

  let outletId = existing.outletId;
  if (input.outletId !== undefined && input.outletId !== existing.outletId) {
    if (!isSuper(user)) {
      throw new InvoiceError(403, "You cannot move an invoice to another outlet.");
    }
    outletId = resolveOutletId(user, input.outletId);
  }

  const lines = input.lines;
  if (lines) {
    for (const line of lines) {
      if (!String(line.rawDescription ?? "").trim()) {
        throw new InvoiceError(400, "Each line needs a description.");
      }
      if (line.quantity != null && (!Number.isFinite(line.quantity) || line.quantity < 0)) {
        throw new InvoiceError(400, "Quantities must be zero or more.");
      }
      if (line.unitPrice != null && (!Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
        throw new InvoiceError(400, "Prices must be zero or more.");
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (lines) {
      await tx.invoiceLine.deleteMany({ where: { invoiceId } });
      await tx.invoiceLine.createMany({
        data: lines.map((line, index) => {
          const itemId = line.itemId || null;
          let matchStatus = line.matchStatus ?? INVOICE_LINE_MATCH.UNMATCHED;
          if (itemId && matchStatus === INVOICE_LINE_MATCH.UNMATCHED) {
            matchStatus = INVOICE_LINE_MATCH.MATCHED;
          }
          if (!itemId) matchStatus = INVOICE_LINE_MATCH.UNMATCHED;
          return {
            invoiceId,
            rawDescription: String(line.rawDescription).trim(),
            itemId,
            quantity:
              line.quantity === null || line.quantity === undefined
                ? null
                : roundEuros(Number(line.quantity)),
            unit: line.unit?.trim() || null,
            unitPrice:
              line.unitPrice === null || line.unitPrice === undefined
                ? null
                : roundEuros(Number(line.unitPrice)),
            lineTotal:
              line.lineTotal === null || line.lineTotal === undefined
                ? null
                : roundEuros(Number(line.lineTotal)),
            vatRate:
              line.vatRate === null || line.vatRate === undefined
                ? null
                : Number(line.vatRate),
            vatAmount:
              line.vatAmount === null || line.vatAmount === undefined
                ? null
                : roundEuros(Number(line.vatAmount)),
            matchStatus,
            needsReview: Boolean(line.needsReview),
            excludeFromReceiving: Boolean(line.excludeFromReceiving),
            sortOrder: index,
          };
        }),
      });
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        outletId,
        ...(input.supplierId !== undefined
          ? { supplierId: input.supplierId || null }
          : {}),
        ...(input.supplierTextRaw !== undefined
          ? { supplierTextRaw: input.supplierTextRaw?.trim() || null }
          : {}),
        ...(input.supplierVatRaw !== undefined
          ? { supplierVatRaw: input.supplierVatRaw?.trim() || null }
          : {}),
        ...(input.invoiceNumber !== undefined
          ? { invoiceNumber: input.invoiceNumber?.trim() || null }
          : {}),
        ...(input.invoiceDate !== undefined
          ? { invoiceDate: parseDateOnly(input.invoiceDate) }
          : {}),
        ...(input.deliveryDate !== undefined
          ? { deliveryDate: parseDateOnly(input.deliveryDate) }
          : {}),
        ...(input.currency !== undefined
          ? { currency: (input.currency?.trim() || "EUR").toUpperCase() }
          : {}),
        ...(input.subtotal !== undefined
          ? {
              subtotal:
                input.subtotal === null ? null : roundEuros(Number(input.subtotal)),
            }
          : {}),
        ...(input.vatAmount !== undefined
          ? {
              vatAmount:
                input.vatAmount === null
                  ? null
                  : roundEuros(Number(input.vatAmount)),
            }
          : {}),
        ...(input.total !== undefined
          ? {
              total:
                input.total === null ? null : roundEuros(Number(input.total)),
            }
          : {}),
        status: INVOICE_STATUS.NEEDS_REVIEW,
      },
    });
  });

  return getInvoice(user, invoiceId);
}

/**
 * Confirm reviewed invoice data. Does NOT touch OutletStock, StockMovement,
 * Delivery, referencePrice, dish costing, or cost alerts.
 */
export async function confirmInvoice(
  user: InvoiceActor,
  invoiceId: string,
  options?: { acknowledgeDuplicates?: boolean },
) {
  const { invoice, duplicates, reconciliation } = await getInvoice(
    user,
    invoiceId,
  );

  if (invoice.status === INVOICE_STATUS.CONFIRMED) {
    throw new InvoiceError(400, "This invoice is already confirmed.");
  }
  if (invoice.status === INVOICE_STATUS.FAILED) {
    throw new InvoiceError(400, "Fix extraction failure before confirming.");
  }
  if (invoice.status === INVOICE_STATUS.UPLOADED) {
    throw new InvoiceError(400, "Wait for extraction before confirming.");
  }

  if (duplicates.length > 0 && !options?.acknowledgeDuplicates) {
    throw new InvoiceError(
      409,
      `Likely duplicate of invoice ${duplicates[0]?.invoiceNumber ?? duplicates[0]?.id}. Acknowledge duplicates to confirm anyway.`,
    );
  }

  if (!invoice.currency) {
    throw new InvoiceError(400, "Currency is required.");
  }

  // Soft block on severe validation — allow confirm with issues only if totals exist.
  if (invoice.total === null) {
    throw new InvoiceError(400, "Enter an invoice total before confirming.");
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: INVOICE_STATUS.CONFIRMED,
      reviewedById: user.id,
      confirmedAt: new Date(),
    },
    include: invoiceInclude,
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: invoice.outletId,
      action: "INVOICE_CONFIRMED",
      detail: `${invoice.invoiceNumber ?? invoice.id} · document saved only (no stock change)`,
    },
  });

  return {
    invoice: updated,
    duplicates,
    reconciliation,
    stockChanged: false as const,
    deliveryCreated: false as const,
    pricesChanged: false as const,
  };
}
