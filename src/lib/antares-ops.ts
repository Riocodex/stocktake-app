import { prisma } from "@/lib/db";
import { PHOTO_STATUS, STOCK_TAKE_STATUS } from "@/lib/constants";

const VERSION = "1.0.0";

export type TribeHealth = {
  service: "tribe";
  status: "healthy" | "degraded";
  environment: string;
  version: string;
  build: string | null;
  runtime: {
    platform: string;
    nodeVersion: string;
  };
  components: {
    web: { status: string };
    database: { status: string; configured: boolean };
  };
  providers: {
    openaiVision: { configured: boolean; verified: boolean };
  };
};

export type TribeStatus = {
  service: "tribe";
  status: "healthy" | "degraded";
  environment: string;
  version: string;
  build: string | null;
  web: { status: string };
  database: { status: string; configured: boolean };
  outlets: {
    active: number;
    inactive: number;
  };
  stockTakes: {
    draft: number;
    submitted: number;
    photosPending: number;
    photosAnalyzing: number;
    photosFailed: number;
  };
  inventory: {
    lowStockRows: number;
    outOfStockRows: number;
  };
  purchasing: {
    openApprovals: number;
    invoicesPendingReview: number;
  };
  transfers: {
    draft: number;
    inTransit: number;
  };
};

export type TribeSummary = {
  service: "tribe";
  generatedAt: string;
  outlets: {
    total: number;
    active: number;
  };
  catalogue: {
    activeItems: number;
    activeDishes: number;
  };
  stockTakes: {
    draft: number;
    submitted: number;
    submittedLast7Days: number;
    byOutlet: Array<{
      outletSlug: string;
      draft: number;
      submitted: number;
    }>;
  };
  inventory: {
    trackedRows: number;
    lowStockRows: number;
    outOfStockRows: number;
  };
  purchasing: {
    openApprovals: number;
    invoicesPendingReview: number;
    invoicesReceivedLast7Days: number;
  };
  transfers: {
    draft: number;
    sent: number;
    receivedLast7Days: number;
  };
  wastage: {
    recordsLast7Days: number;
  };
};

async function probeDatabase(): Promise<{ status: string; configured: boolean }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", configured: true };
  } catch {
    return { status: "error", configured: true };
  }
}

function countLowAndOut(
  stockRows: Array<{
    quantity: number;
    parLevel: number | null;
    item: { lowStockThreshold: number; parLevel: number };
  }>,
) {
  let lowStockRows = 0;
  let outOfStockRows = 0;
  for (const row of stockRows) {
    if (row.quantity <= 0) {
      outOfStockRows += 1;
      continue;
    }
    const threshold = row.parLevel ?? row.item.lowStockThreshold ?? row.item.parLevel ?? 0;
    if (threshold > 0 && row.quantity <= threshold) {
      lowStockRows += 1;
    }
  }
  return { lowStockRows, outOfStockRows };
}

export async function buildTribeHealth(): Promise<TribeHealth> {
  const database = await probeDatabase();
  const openaiConfigured = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const degraded = database.status !== "ok";
  return {
    service: "tribe",
    status: degraded ? "degraded" : "healthy",
    environment: process.env.NODE_ENV || "development",
    version: VERSION,
    build: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null,
    runtime: {
      platform: process.platform,
      nodeVersion: process.version,
    },
    components: {
      web: { status: "ok" },
      database,
    },
    providers: {
      openaiVision: { configured: openaiConfigured, verified: false },
    },
  };
}

export async function buildTribeStatus(): Promise<TribeStatus> {
  const database = await probeDatabase();
  const base = {
    service: "tribe" as const,
    environment: process.env.NODE_ENV || "development",
    version: VERSION,
    build: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null,
    web: { status: "ok" },
    database,
  };

  if (database.status !== "ok") {
    return {
      ...base,
      status: "degraded",
      outlets: { active: 0, inactive: 0 },
      stockTakes: {
        draft: 0,
        submitted: 0,
        photosPending: 0,
        photosAnalyzing: 0,
        photosFailed: 0,
      },
      inventory: { lowStockRows: 0, outOfStockRows: 0 },
      purchasing: { openApprovals: 0, invoicesPendingReview: 0 },
      transfers: { draft: 0, inTransit: 0 },
    };
  }

  const [
    activeOutlets,
    inactiveOutlets,
    draftTakes,
    submittedTakes,
    photosPending,
    photosAnalyzing,
    photosFailed,
    stockRows,
    openApprovals,
    invoicesPendingReview,
    transferDraft,
    transferSent,
  ] = await Promise.all([
    prisma.outlet.count({ where: { isActive: true } }),
    prisma.outlet.count({ where: { isActive: false } }),
    prisma.stockTake.count({ where: { status: STOCK_TAKE_STATUS.DRAFT } }),
    prisma.stockTake.count({ where: { status: STOCK_TAKE_STATUS.SUBMITTED } }),
    prisma.stockPhoto.count({ where: { status: PHOTO_STATUS.PENDING } }),
    prisma.stockPhoto.count({ where: { status: PHOTO_STATUS.ANALYZING } }),
    prisma.stockPhoto.count({ where: { status: PHOTO_STATUS.FAILED } }),
    prisma.outletStock.findMany({
      select: {
        quantity: true,
        parLevel: true,
        item: { select: { lowStockThreshold: true, parLevel: true } },
      },
    }),
    prisma.orderApprovalRequest.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({
      where: { status: { in: ["UPLOADED", "EXTRACTED", "NEEDS_REVIEW"] } },
    }),
    prisma.transfer.count({ where: { status: "DRAFT" } }),
    prisma.transfer.count({ where: { status: "SENT" } }),
  ]);

  const { lowStockRows, outOfStockRows } = countLowAndOut(stockRows);

  return {
    ...base,
    status: "healthy",
    outlets: { active: activeOutlets, inactive: inactiveOutlets },
    stockTakes: {
      draft: draftTakes,
      submitted: submittedTakes,
      photosPending,
      photosAnalyzing,
      photosFailed,
    },
    inventory: { lowStockRows, outOfStockRows },
    purchasing: { openApprovals, invoicesPendingReview },
    transfers: { draft: transferDraft, inTransit: transferSent },
  };
}

export async function buildTribeSummary(): Promise<TribeSummary> {
  const generatedAt = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    outletsTotal,
    outletsActive,
    activeItems,
    activeDishes,
    draftTakes,
    submittedTakes,
    submittedLast7Days,
    trackedRows,
    stockRows,
    openApprovals,
    invoicesPendingReview,
    invoicesReceivedLast7Days,
    transferDraft,
    transferSent,
    receivedLast7Days,
    wastageLast7Days,
    outlets,
  ] = await Promise.all([
    prisma.outlet.count(),
    prisma.outlet.count({ where: { isActive: true } }),
    prisma.inventoryItem.count({ where: { isActive: true } }),
    prisma.dish.count({ where: { isActive: true } }),
    prisma.stockTake.count({ where: { status: STOCK_TAKE_STATUS.DRAFT } }),
    prisma.stockTake.count({ where: { status: STOCK_TAKE_STATUS.SUBMITTED } }),
    prisma.stockTake.count({
      where: {
        status: STOCK_TAKE_STATUS.SUBMITTED,
        submittedAt: { gte: weekAgo },
      },
    }),
    prisma.outletStock.count(),
    prisma.outletStock.findMany({
      select: {
        quantity: true,
        parLevel: true,
        item: { select: { lowStockThreshold: true, parLevel: true } },
      },
    }),
    prisma.orderApprovalRequest.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({
      where: { status: { in: ["UPLOADED", "EXTRACTED", "NEEDS_REVIEW"] } },
    }),
    prisma.invoice.count({
      where: {
        receivingStatus: { in: ["PARTIALLY_RECEIVED", "FULLY_RECEIVED"] },
        updatedAt: { gte: weekAgo },
      },
    }),
    prisma.transfer.count({ where: { status: "DRAFT" } }),
    prisma.transfer.count({ where: { status: "SENT" } }),
    prisma.transfer.count({
      where: { status: "RECEIVED", receivedAt: { gte: weekAgo } },
    }),
    prisma.wastage.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.outlet.findMany({
      select: {
        slug: true,
        stockTakes: { select: { status: true } },
      },
    }),
  ]);

  const { lowStockRows, outOfStockRows } = countLowAndOut(stockRows);

  const byOutlet = outlets.map((outlet) => {
    let draft = 0;
    let submitted = 0;
    for (const take of outlet.stockTakes) {
      if (take.status === STOCK_TAKE_STATUS.DRAFT) draft += 1;
      else if (take.status === STOCK_TAKE_STATUS.SUBMITTED) submitted += 1;
    }
    return { outletSlug: outlet.slug, draft, submitted };
  });

  return {
    service: "tribe",
    generatedAt,
    outlets: { total: outletsTotal, active: outletsActive },
    catalogue: { activeItems, activeDishes },
    stockTakes: {
      draft: draftTakes,
      submitted: submittedTakes,
      submittedLast7Days,
      byOutlet,
    },
    inventory: { trackedRows, lowStockRows, outOfStockRows },
    purchasing: {
      openApprovals,
      invoicesPendingReview,
      invoicesReceivedLast7Days,
    },
    transfers: {
      draft: transferDraft,
      sent: transferSent,
      receivedLast7Days,
    },
    wastage: { recordsLast7Days: wastageLast7Days },
  };
}
