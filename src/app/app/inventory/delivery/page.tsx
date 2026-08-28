import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOutlets } from "@/lib/queries";
import { Card } from "@/components/ui";
import { DeliveryForm } from "../delivery-form";

export const metadata: Metadata = { title: "Record delivery" };

export default async function DeliveryPage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);

  const [outlets, items] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/inventory"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Inventory
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Record a delivery
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          When a supplier drops stock, add it here. Quantities go onto live
          inventory without a full stock take.
        </p>
      </header>

      <Card className="max-w-3xl">
        <DeliveryForm
          outlets={outlets}
          items={items.map((item) => ({
            id: item.id,
            name: item.brand ? `${item.brand} ${item.name}` : item.name,
            unit: item.unit,
            category: item.category.name,
          }))}
          fixedOutletId={superAdmin ? null : user.outletId}
          fixedOutletName={superAdmin ? null : user.outletName}
        />
      </Card>
    </div>
  );
}
