import {
  ORDER_APPROVAL_STATUS,
  ORDERING_METHOD,
  ORDERING_METHOD_LABELS,
  ROLES,
  type OrderApprovalStatus,
  type OrderingMethod,
  isOrderingMethod,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isExternalOrderingMethod,
  validateOrderingUrl,
} from "@/lib/ordering-urls";

/** Minimal actor — avoids importing auth (server-only) into scripts. */
export type OrderingActor = {
  id: string;
  role: string;
  outletId: string | null;
};

function isSuper(user: OrderingActor) {
  return user.role === ROLES.SUPER_ADMIN;
}

function assertSuper(user: OrderingActor) {
  if (!isSuper(user)) {
    throw new OrderingError(403, "Only super admins can manage suppliers.");
  }
}

function assertOutletAccess(user: OrderingActor, outletId: string) {
  if (isSuper(user)) return;
  if (user.outletId !== outletId) {
    throw new OrderingError(403, "You do not have access to this outlet.");
  }
}

export class OrderingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type HubOrderingCard = {
  id: string;
  title: string;
  category: string;
  method: OrderingMethod;
  methodLabel: string;
  externalUrl: string | null;
  instructions: string | null;
  requiresApproval: boolean;
  isSample: boolean;
  sortOrder: number;
  supplier: { id: string; name: string; isSample: boolean };
  outletScoped: boolean;
  /** Latest approval for this outlet (if approval required). */
  approval: {
    id: string;
    status: OrderApprovalStatus;
    createdAt: Date;
    reviewedAt: Date | null;
    decisionNote: string | null;
  } | null;
  /** True when staff may open the external destination now. */
  canOpenExternal: boolean;
  openBlockedReason: string | null;
};

function cardVisibleForOutlet(
  outletIds: string[],
  outletId: string | null,
): boolean {
  // Empty outlet list = available to all outlets.
  if (outletIds.length === 0) return true;
  if (!outletId) return true; // super viewing all
  return outletIds.includes(outletId);
}

function resolveCanOpen(args: {
  method: OrderingMethod;
  requiresApproval: boolean;
  approvalStatus: OrderApprovalStatus | null;
  externalUrl: string | null;
  /** SUPER_ADMIN is the office — skip the approval gate. */
  bypassApproval?: boolean;
}): { canOpen: boolean; reason: string | null } {
  if (!isExternalOrderingMethod(args.method)) {
    return {
      canOpen: false,
      reason: "This card has no external ordering link.",
    };
  }
  if (!args.externalUrl) {
    return { canOpen: false, reason: "No ordering URL is configured." };
  }
  if (!args.requiresApproval || args.bypassApproval) {
    return { canOpen: true, reason: null };
  }
  if (args.approvalStatus === ORDER_APPROVAL_STATUS.APPROVED) {
    return { canOpen: true, reason: null };
  }
  if (args.approvalStatus === ORDER_APPROVAL_STATUS.PENDING) {
    return {
      canOpen: false,
      reason: "Waiting for office approval before you can open the link.",
    };
  }
  if (args.approvalStatus === ORDER_APPROVAL_STATUS.REJECTED) {
    return {
      canOpen: false,
      reason: "The last request was rejected. Submit a new approval request.",
    };
  }
  return {
    canOpen: false,
    reason: "Office approval is required before opening this link.",
  };
}

/**
 * Ordering cards available to the current user / outlet.
 * Opening a link never creates stock or marks an order as submitted.
 */
export async function listOrderingCardsForHub(
  user: OrderingActor,
  options?: { outletId?: string | null; includeInactive?: boolean },
): Promise<HubOrderingCard[]> {
  const scopeOutlet = isSuper(user)
    ? options?.outletId ?? null
    : user.outletId;

  if (scopeOutlet) {
    assertOutletAccess(user, scopeOutlet);
  } else if (!isSuper(user)) {
    throw new OrderingError(403, "Your account is not assigned to an outlet.");
  }

  const cards = await prisma.orderingCard.findMany({
    where: {
      ...(options?.includeInactive ? {} : { isActive: true }),
      supplier: { isActive: true },
    },
    include: {
      supplier: { select: { id: true, name: true, isSample: true } },
      outlets: { select: { outletId: true } },
      approvals: scopeOutlet
        ? {
            where: { outletId: scopeOutlet },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              createdAt: true,
              reviewedAt: true,
              decisionNote: true,
            },
          }
        : false,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  return cards
    .filter((card) =>
      cardVisibleForOutlet(
        card.outlets.map((row) => row.outletId),
        scopeOutlet,
      ),
    )
    .map((card) => {
      const method = isOrderingMethod(card.method)
        ? card.method
        : ORDERING_METHOD.WEBSITE;
      const latest = Array.isArray(card.approvals)
        ? card.approvals[0] ?? null
        : null;
      const approvalStatus = latest
        ? (latest.status as OrderApprovalStatus)
        : null;
      const gate = resolveCanOpen({
        method,
        requiresApproval: card.requiresApproval,
        approvalStatus,
        externalUrl: card.externalUrl,
        bypassApproval: isSuper(user),
      });

      return {
        id: card.id,
        title: card.title,
        category: card.category,
        method,
        methodLabel: ORDERING_METHOD_LABELS[method],
        externalUrl: card.externalUrl,
        instructions: card.instructions,
        requiresApproval: card.requiresApproval,
        isSample: card.isSample,
        sortOrder: card.sortOrder,
        supplier: card.supplier,
        outletScoped: card.outlets.length > 0,
        approval: latest
          ? {
              id: latest.id,
              status: latest.status as OrderApprovalStatus,
              createdAt: latest.createdAt,
              reviewedAt: latest.reviewedAt,
              decisionNote: latest.decisionNote,
            }
          : null,
        canOpenExternal: gate.canOpen,
        openBlockedReason: gate.reason,
      };
    });
}

/**
 * Server-side gate before returning an external URL to open.
 * Does not create stock movements or claim an order was submitted.
 */
export async function authorizeExternalOpen(
  user: OrderingActor,
  cardId: string,
  outletId?: string | null,
): Promise<{ url: string; method: OrderingMethod; title: string }> {
  const targetOutlet = isSuper(user)
    ? outletId ?? user.outletId
    : user.outletId;

  if (!targetOutlet) {
    throw new OrderingError(
      400,
      "Choose an outlet before opening an ordering link.",
    );
  }
  assertOutletAccess(user, targetOutlet);

  const card = await prisma.orderingCard.findUnique({
    where: { id: cardId },
    include: {
      supplier: { select: { isActive: true } },
      outlets: { select: { outletId: true } },
    },
  });

  if (!card || !card.isActive || !card.supplier.isActive) {
    throw new OrderingError(404, "That ordering card is not available.");
  }

  if (
    !cardVisibleForOutlet(
      card.outlets.map((row) => row.outletId),
      targetOutlet,
    )
  ) {
    throw new OrderingError(
      403,
      "That ordering card is not enabled for this outlet.",
    );
  }

  if (!isOrderingMethod(card.method) || !isExternalOrderingMethod(card.method)) {
    throw new OrderingError(400, "This card has no external ordering link.");
  }

  const urlCheck = validateOrderingUrl(card.method, card.externalUrl);
  if (!urlCheck.ok || !urlCheck.url) {
    throw new OrderingError(400, urlCheck.ok ? "No URL configured." : urlCheck.error);
  }

  // SUPER_ADMIN is the office — they may open without a prior approval request.
  if (card.requiresApproval && !isSuper(user)) {
    const latest = await prisma.orderApprovalRequest.findFirst({
      where: { cardId: card.id, outletId: targetOutlet },
      orderBy: { createdAt: "desc" },
    });
    if (!latest || latest.status !== ORDER_APPROVAL_STATUS.APPROVED) {
      throw new OrderingError(
        403,
        "Office approval is required before opening this ordering link.",
      );
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: targetOutlet,
      action: "ORDERING_LINK_OPENED",
      detail: `${card.title} · ${card.method} (link opened — order not submitted)`,
    },
  });

  return { url: urlCheck.url, method: card.method, title: card.title };
}

export async function listSuppliers(user: OrderingActor, includeInactive = false) {
  assertSuper(user);
  return prisma.supplier.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: {
      cards: {
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        include: { outlets: { select: { outletId: true } } },
      },
      _count: { select: { deliveries: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createSupplier(
  user: OrderingActor,
  input: { name: string; notes?: string | null },
) {
  assertSuper(user);
  const name = String(input.name ?? "").trim();
  if (!name) throw new OrderingError(400, "Supplier name is required.");

  return prisma.supplier.create({
    data: {
      name,
      notes: input.notes?.trim() || null,
      isSample: false,
    },
  });
}

export async function updateSupplier(
  user: OrderingActor,
  supplierId: string,
  input: { name?: string; notes?: string | null; isActive?: boolean },
) {
  assertSuper(user);
  const existing = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!existing) throw new OrderingError(404, "Supplier not found.");

  const name =
    input.name !== undefined ? String(input.name).trim() : existing.name;
  if (!name) throw new OrderingError(400, "Supplier name is required.");

  return prisma.supplier.update({
    where: { id: supplierId },
    data: {
      name,
      notes:
        input.notes !== undefined
          ? input.notes?.trim() || null
          : existing.notes,
      isActive:
        input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
    },
  });
}

export async function createOrderingCard(
  user: OrderingActor,
  input: {
    supplierId: string;
    title: string;
    category: string;
    method: string;
    externalUrl?: string | null;
    instructions?: string | null;
    requiresApproval?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    outletIds?: string[];
  },
) {
  assertSuper(user);

  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
  });
  if (!supplier) throw new OrderingError(404, "Supplier not found.");

  const title = String(input.title ?? "").trim();
  const category = String(input.category ?? "").trim();
  if (!title) throw new OrderingError(400, "Card title is required.");
  if (!category) throw new OrderingError(400, "Category is required.");
  if (!isOrderingMethod(input.method)) {
    throw new OrderingError(400, "Choose a valid ordering method.");
  }

  const urlCheck = validateOrderingUrl(input.method, input.externalUrl);
  if (!urlCheck.ok) throw new OrderingError(400, urlCheck.error);

  const outletIds = [...new Set((input.outletIds ?? []).filter(Boolean))];

  return prisma.orderingCard.create({
    data: {
      supplierId: supplier.id,
      title,
      category,
      method: input.method,
      externalUrl: urlCheck.url,
      instructions: input.instructions?.trim() || null,
      requiresApproval: Boolean(input.requiresApproval),
      isActive: input.isActive !== false,
      isSample: false,
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
      outlets: outletIds.length
        ? { create: outletIds.map((outletId) => ({ outletId })) }
        : undefined,
    },
  });
}

export async function updateOrderingCard(
  user: OrderingActor,
  cardId: string,
  input: {
    title?: string;
    category?: string;
    method?: string;
    externalUrl?: string | null;
    instructions?: string | null;
    requiresApproval?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    outletIds?: string[];
  },
) {
  assertSuper(user);

  const existing = await prisma.orderingCard.findUnique({
    where: { id: cardId },
  });
  if (!existing) throw new OrderingError(404, "Ordering card not found.");

  const method = input.method ?? existing.method;
  if (!isOrderingMethod(method)) {
    throw new OrderingError(400, "Choose a valid ordering method.");
  }

  const urlSource =
    input.externalUrl !== undefined ? input.externalUrl : existing.externalUrl;
  const urlCheck = validateOrderingUrl(method, urlSource);
  if (!urlCheck.ok) throw new OrderingError(400, urlCheck.error);

  const title =
    input.title !== undefined ? String(input.title).trim() : existing.title;
  const category =
    input.category !== undefined
      ? String(input.category).trim()
      : existing.category;
  if (!title) throw new OrderingError(400, "Card title is required.");
  if (!category) throw new OrderingError(400, "Category is required.");

  return prisma.$transaction(async (tx) => {
    if (input.outletIds !== undefined) {
      const outletIds = [...new Set(input.outletIds.filter(Boolean))];
      await tx.orderingCardOutlet.deleteMany({ where: { cardId } });
      if (outletIds.length) {
        await tx.orderingCardOutlet.createMany({
          data: outletIds.map((outletId) => ({ cardId, outletId })),
        });
      }
    }

    return tx.orderingCard.update({
      where: { id: cardId },
      data: {
        title,
        category,
        method,
        externalUrl: urlCheck.url,
        instructions:
          input.instructions !== undefined
            ? input.instructions?.trim() || null
            : existing.instructions,
        requiresApproval:
          input.requiresApproval !== undefined
            ? Boolean(input.requiresApproval)
            : existing.requiresApproval,
        isActive:
          input.isActive !== undefined
            ? Boolean(input.isActive)
            : existing.isActive,
        sortOrder:
          input.sortOrder !== undefined && Number.isFinite(input.sortOrder)
            ? Number(input.sortOrder)
            : existing.sortOrder,
      },
    });
  });
}

export async function requestOrderApproval(
  user: OrderingActor,
  input: {
    cardId: string;
    outletId?: string | null;
    note?: string | null;
    expectedItems?: string | null;
  },
) {
  const targetOutlet = isSuper(user)
    ? input.outletId ?? user.outletId
    : user.outletId;

  if (!targetOutlet) {
    throw new OrderingError(400, "Choose an outlet for this approval request.");
  }
  assertOutletAccess(user, targetOutlet);

  const card = await prisma.orderingCard.findUnique({
    where: { id: input.cardId },
    include: {
      supplier: { select: { isActive: true } },
      outlets: { select: { outletId: true } },
    },
  });

  if (!card || !card.isActive || !card.supplier.isActive) {
    throw new OrderingError(404, "That ordering card is not available.");
  }
  if (!card.requiresApproval) {
    throw new OrderingError(
      400,
      "This card does not require office approval — you can open the link directly.",
    );
  }
  if (
    !cardVisibleForOutlet(
      card.outlets.map((row) => row.outletId),
      targetOutlet,
    )
  ) {
    throw new OrderingError(
      403,
      "That ordering card is not enabled for this outlet.",
    );
  }

  const pending = await prisma.orderApprovalRequest.findFirst({
    where: {
      cardId: card.id,
      outletId: targetOutlet,
      status: ORDER_APPROVAL_STATUS.PENDING,
    },
  });
  if (pending) {
    throw new OrderingError(
      400,
      "An approval request is already pending for this card.",
    );
  }

  const created = await prisma.orderApprovalRequest.create({
    data: {
      cardId: card.id,
      outletId: targetOutlet,
      requestedById: user.id,
      status: ORDER_APPROVAL_STATUS.PENDING,
      note: input.note?.trim() || null,
      expectedItems: input.expectedItems?.trim() || null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: targetOutlet,
      action: "ORDER_APPROVAL_REQUESTED",
      detail: card.title,
    },
  });

  return created;
}

export async function reviewOrderApproval(
  user: OrderingActor,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  decisionNote?: string | null,
) {
  assertSuper(user);

  if (
    decision !== ORDER_APPROVAL_STATUS.APPROVED &&
    decision !== ORDER_APPROVAL_STATUS.REJECTED
  ) {
    throw new OrderingError(400, "Decision must be approve or reject.");
  }

  const existing = await prisma.orderApprovalRequest.findUnique({
    where: { id: requestId },
    include: { card: { select: { title: true } } },
  });
  if (!existing) throw new OrderingError(404, "Approval request not found.");
  if (existing.status !== ORDER_APPROVAL_STATUS.PENDING) {
    throw new OrderingError(400, "This request has already been reviewed.");
  }

  const updated = await prisma.orderApprovalRequest.update({
    where: { id: requestId },
    data: {
      status: decision,
      reviewedById: user.id,
      reviewedAt: new Date(),
      decisionNote: decisionNote?.trim() || null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: existing.outletId,
      action:
        decision === ORDER_APPROVAL_STATUS.APPROVED
          ? "ORDER_APPROVAL_APPROVED"
          : "ORDER_APPROVAL_REJECTED",
      detail: `${existing.card.title}${
        decisionNote?.trim() ? ` · ${decisionNote.trim()}` : ""
      }`,
    },
  });

  return updated;
}

export async function listOrderApprovals(
  user: OrderingActor,
  options?: { status?: string | null; outletId?: string | null },
) {
  const scope = isSuper(user) ? options?.outletId ?? null : user.outletId;

  if (!isSuper(user) && !scope) {
    throw new OrderingError(403, "Your account is not assigned to an outlet.");
  }

  return prisma.orderApprovalRequest.findMany({
    where: {
      ...(scope ? { outletId: scope } : {}),
      ...(options?.status ? { status: options.status } : {}),
    },
    include: {
      card: {
        select: {
          id: true,
          title: true,
          method: true,
          requiresApproval: true,
          supplier: { select: { id: true, name: true } },
        },
      },
      outlet: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listActiveSuppliersForSelect() {
  return prisma.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true, isSample: true },
    orderBy: { name: "asc" },
  });
}
