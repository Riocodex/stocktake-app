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

  const [outlets, items, suppliers] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isSample: true },
      orderBy: { name: "asc" },
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
        <p className="mt-2">
          <Link
            href="/app/purchasing"
            className="text-xs font-semibold text-clay hover:underline"
          >
            Purchasing &amp; Orders
          </Link>
        </p>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Record a delivery
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          When goods physically arrive, record actual quantities here. Optional
          purchase prices are kept as receiving history and do not change
          group-wide dish costing prices.
        </p>
      </header>

      <Card className="max-w-3xl">
        <DeliveryForm
          outlets={outlets}
          suppliers={suppliers}
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
