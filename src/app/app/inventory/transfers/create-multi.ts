"use client";

export type MultiTransferLine = {
  itemId: string;
  quantity: number;
  toOutletId: string;
};

export type CreatedTransfer = { id: string; reference?: string };

/**
 * Groups product lines by destination and creates one DRAFT transfer per outlet.
 */
export async function createTransfersByDestination(input: {
  fromOutletId: string;
  note?: string;
  imageUrl?: string;
  lines: MultiTransferLine[];
}): Promise<{ transfers: CreatedTransfer[]; error?: string }> {
  const grouped = new Map<string, Map<string, number>>();

  for (const line of input.lines) {
    const toOutletId = String(line.toOutletId ?? "").trim();
    const itemId = String(line.itemId ?? "").trim();
    const quantity = Number(line.quantity);
    if (!toOutletId || !itemId) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (toOutletId === input.fromOutletId) {
      return {
        transfers: [],
        error: "Source and destination outlets must be different.",
      };
    }
    const byItem = grouped.get(toOutletId) ?? new Map<string, number>();
    byItem.set(itemId, Math.round(((byItem.get(itemId) ?? 0) + quantity) * 100) / 100);
    grouped.set(toOutletId, byItem);
  }

  if (grouped.size === 0) {
    return {
      transfers: [],
      error: "Add at least one product with a destination and quantity.",
    };
  }

  const transfers: CreatedTransfer[] = [];
  for (const [toOutletId, byItem] of grouped) {
    const response = await fetch("/api/mobile/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromOutletId: input.fromOutletId,
        toOutletId,
        note: input.note || undefined,
        imageUrl: input.imageUrl || undefined,
        lines: [...byItem.entries()].map(([itemId, quantity]) => ({
          itemId,
          quantity,
        })),
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      transfer?: CreatedTransfer;
    };
    if (!response.ok || !payload.transfer?.id) {
      return {
        transfers,
        error:
          payload.error ??
          `Could not create transfer to one of the destinations (${transfers.length} created before failure).`,
      };
    }
    transfers.push(payload.transfer);
  }

  return { transfers };
}
