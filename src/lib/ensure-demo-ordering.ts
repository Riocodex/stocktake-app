import {
  DEMO_ORDERING_WEBSITE_URL,
  DEMO_ORDERING_WHATSAPP_URL,
  ORDERING_METHOD,
} from "@/lib/constants";
import { prisma } from "@/lib/db";

/**
 * Idempotent sample ordering cards for demos.
 * Does not reset inventory, does not overwrite non-sample suppliers.
 * Safe to call on hub load / tests.
 */
export async function ensureDemoOrderingCards(): Promise<{
  created: number;
  updated: number;
}> {
  // Guard against a stale PrismaClient after schema changes (HMR / missed generate).
  if (
    typeof (prisma as { supplier?: { findFirst?: unknown } }).supplier
      ?.findFirst !== "function"
  ) {
    throw new Error(
      "Prisma client is missing Supplier. Run `npx prisma generate` and restart the Next.js server.",
    );
  }

  let created = 0;
  let updated = 0;

  const whatsappSupplier = await upsertSampleSupplier(
    "Sample · Fresh Produce & Pantry (demo)",
    "Sample configuration only — not a verified supplier relationship. Uses a shared demo WhatsApp group link.",
  );
  const websiteSupplier = await upsertSampleSupplier(
    "Sample · Bakery & Sweets (demo)",
    "Sample configuration only — not a verified supplier relationship. Uses the TRiBE Malta shop demo URL.",
  );

  const cards: Array<{
    supplierId: string;
    title: string;
    category: string;
    method: string;
    externalUrl: string;
    instructions: string;
    sortOrder: number;
    requiresApproval?: boolean;
  }> = [
    {
      supplierId: whatsappSupplier.id,
      title: "Order Vegetables & Avocados",
      category: "Produce",
      method: ORDERING_METHOD.WHATSAPP,
      externalUrl: DEMO_ORDERING_WHATSAPP_URL,
      instructions:
        "Sample WhatsApp card. Open the group and place your order yourself. Opening this link does not submit an order or update stock.",
      sortOrder: 10,
    },
    {
      supplierId: whatsappSupplier.id,
      title: "Order Coffee",
      category: "Coffee",
      method: ORDERING_METHOD.WHATSAPP,
      externalUrl: DEMO_ORDERING_WHATSAPP_URL,
      instructions:
        "Sample WhatsApp card. Message the group with what you need. Stock only increases when you record a delivery.",
      sortOrder: 20,
    },
    {
      supplierId: whatsappSupplier.id,
      title: "Order Food Supplies",
      category: "Dry goods",
      method: ORDERING_METHOD.WHATSAPP,
      externalUrl: DEMO_ORDERING_WHATSAPP_URL,
      instructions:
        "Sample WhatsApp card. Place the order externally, then receive goods via Inventory → Delivery.",
      sortOrder: 30,
    },
    {
      supplierId: whatsappSupplier.id,
      title: "Order Beverages",
      category: "Beverages",
      method: ORDERING_METHOD.WHATSAPP,
      externalUrl: DEMO_ORDERING_WHATSAPP_URL,
      instructions:
        "Sample WhatsApp card. Office approval is required on this demo card before the link unlocks.",
      sortOrder: 40,
      requiresApproval: true,
    },
    {
      supplierId: websiteSupplier.id,
      title: "Order Bakery",
      category: "Bakery",
      method: ORDERING_METHOD.WEBSITE,
      externalUrl: DEMO_ORDERING_WEBSITE_URL,
      instructions:
        "Sample website card. Opens the demo shop in a new tab — not embedded. Does not mark an order as placed.",
      sortOrder: 50,
    },
    {
      supplierId: websiteSupplier.id,
      title: "Order Sweets & Desserts",
      category: "Sweets",
      method: ORDERING_METHOD.WEBSITE,
      externalUrl: DEMO_ORDERING_WEBSITE_URL,
      instructions:
        "Sample website card. Order on the supplier site yourself, then record received quantities when goods arrive.",
      sortOrder: 60,
    },
    {
      supplierId: websiteSupplier.id,
      title: "Order Cakes & Pastries",
      category: "Cakes",
      method: ORDERING_METHOD.WEBSITE,
      externalUrl: DEMO_ORDERING_WEBSITE_URL,
      instructions:
        "Sample website card. External browse only — never increases OutletStock by itself.",
      sortOrder: 70,
    },
  ];

  for (const spec of cards) {
    const existing = await prisma.orderingCard.findFirst({
      where: {
        isSample: true,
        title: spec.title,
        supplierId: spec.supplierId,
      },
    });

    if (existing) {
      await prisma.orderingCard.update({
        where: { id: existing.id },
        data: {
          category: spec.category,
          method: spec.method,
          externalUrl: spec.externalUrl,
          instructions: spec.instructions,
          sortOrder: spec.sortOrder,
          requiresApproval: Boolean(spec.requiresApproval),
          isActive: true,
          isSample: true,
        },
      });
      updated += 1;
    } else {
      await prisma.orderingCard.create({
        data: {
          supplierId: spec.supplierId,
          title: spec.title,
          category: spec.category,
          method: spec.method,
          externalUrl: spec.externalUrl,
          instructions: spec.instructions,
          sortOrder: spec.sortOrder,
          requiresApproval: Boolean(spec.requiresApproval),
          isActive: true,
          isSample: true,
        },
      });
      created += 1;
    }
  }

  return { created, updated };
}

async function upsertSampleSupplier(name: string, notes: string) {
  const existing = await prisma.supplier.findFirst({
    where: { isSample: true, name },
  });
  if (existing) {
    return prisma.supplier.update({
      where: { id: existing.id },
      data: { notes, isActive: true, isSample: true },
    });
  }
  return prisma.supplier.create({
    data: { name, notes, isActive: true, isSample: true },
  });
}
