"use server";

import { revalidatePath } from "next/cache";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  OrderingError,
  authorizeExternalOpen,
  createOrderingCard,
  createSupplier,
  requestOrderApproval,
  reviewOrderApproval,
  updateOrderingCard,
  updateSupplier,
} from "@/lib/ordering";
import { ensureDemoOrderingCards } from "@/lib/ensure-demo-ordering";

export type PurchasingActionResult = {
  error: string | null;
  message?: string;
  url?: string;
};

const OK: PurchasingActionResult = { error: null };

function fail(error: unknown): PurchasingActionResult {
  if (error instanceof OrderingError) return { error: error.message };
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong." };
}

function revalidatePurchasing() {
  revalidatePath("/app/purchasing");
  revalidatePath("/app/purchasing/suppliers");
  revalidatePath("/app/purchasing/approvals");
}

export async function ensureDemoOrderingAction(): Promise<PurchasingActionResult> {
  try {
    await requireUser();
    const result = await ensureDemoOrderingCards();
    revalidatePurchasing();
    return {
      ...OK,
      message: `Sample cards ready (${result.created} new, ${result.updated} refreshed).`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function openOrderingLinkAction(
  _previous: PurchasingActionResult,
  formData: FormData,
): Promise<PurchasingActionResult> {
  try {
    const user = await requireUser();
    const cardId = String(formData.get("cardId") ?? "").trim();
    const outletId = String(formData.get("outletId") ?? "").trim() || null;
    if (!cardId) return { error: "Missing ordering card." };

    const opened = await authorizeExternalOpen(user, cardId, outletId);
    return {
      ...OK,
      url: opened.url,
      message:
        "Link ready. Opening does not submit an order or change stock.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function requestApprovalAction(
  _previous: PurchasingActionResult,
  formData: FormData,
): Promise<PurchasingActionResult> {
  try {
    const user = await requireUser();
    await requestOrderApproval(user, {
      cardId: String(formData.get("cardId") ?? "").trim(),
      outletId: String(formData.get("outletId") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
      expectedItems: String(formData.get("expectedItems") ?? "").trim() || null,
    });
    revalidatePurchasing();
    return {
      ...OK,
      message:
        "Approval requested. Approval authorizes ordering but does not prove the supplier received an order.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function reviewApprovalAction(
  _previous: PurchasingActionResult,
  formData: FormData,
): Promise<PurchasingActionResult> {
  try {
    const user = await requireUser();
    if (!isSuperAdmin(user)) {
      return { error: "Only super admins can approve or reject requests." };
    }
    const requestId = String(formData.get("requestId") ?? "").trim();
    const decision = String(formData.get("decision") ?? "").trim();
    const decisionNote =
      String(formData.get("decisionNote") ?? "").trim() || null;
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return { error: "Choose approve or reject." };
    }
    await reviewOrderApproval(user, requestId, decision, decisionNote);
    revalidatePurchasing();
    return {
      ...OK,
      message:
        decision === "APPROVED"
          ? "Approved. The outlet may now open the ordering link. This does not mean the supplier received an order."
          : "Request rejected.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function saveSupplierAction(
  _previous: PurchasingActionResult,
  formData: FormData,
): Promise<PurchasingActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("supplierId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const isActive = formData.get("isActive") === "on";

    if (id) {
      await updateSupplier(user, id, { name, notes, isActive });
    } else {
      await createSupplier(user, { name, notes });
    }
    revalidatePurchasing();
    return { ...OK, message: id ? "Supplier updated." : "Supplier added." };
  } catch (error) {
    return fail(error);
  }
}

export async function saveOrderingCardAction(
  _previous: PurchasingActionResult,
  formData: FormData,
): Promise<PurchasingActionResult> {
  try {
    const user = await requireUser();
    const cardId = String(formData.get("cardId") ?? "").trim();
    const supplierId = String(formData.get("supplierId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const method = String(formData.get("method") ?? "").trim();
    const externalUrl =
      String(formData.get("externalUrl") ?? "").trim() || null;
    const instructions =
      String(formData.get("instructions") ?? "").trim() || null;
    const requiresApproval = formData.get("requiresApproval") === "on";
    const isActiveValues = formData.getAll("isActive").map(String);
    const isActive = cardId
      ? isActiveValues.includes("on")
      : true;
    const sortOrder = Number(formData.get("sortOrder") ?? 0);
    const outletIds = formData
      .getAll("outletIds")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (cardId) {
      await updateOrderingCard(user, cardId, {
        title,
        category,
        method,
        externalUrl,
        instructions,
        requiresApproval,
        isActive,
        sortOrder,
        outletIds,
      });
    } else {
      await createOrderingCard(user, {
        supplierId,
        title,
        category,
        method,
        externalUrl,
        instructions,
        requiresApproval,
        isActive,
        sortOrder,
        outletIds,
      });
    }
    revalidatePurchasing();
    return {
      ...OK,
      message: cardId ? "Ordering card updated." : "Ordering card created.",
    };
  } catch (error) {
    return fail(error);
  }
}
