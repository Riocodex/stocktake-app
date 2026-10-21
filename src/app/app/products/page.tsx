import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Products & Dishes" };

export default async function ProductsHubPage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);

  const [itemCount, dishCount] = await Promise.all([
    prisma.inventoryItem.count({ where: { isActive: true } }),
    prisma.dish.count(),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-ink-muted">Catalogue</p>
          <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
            Products &amp; Dishes
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Manage physical Items and prepared Dishes. Stock quantities live under
            Stock &amp; Inventory.
          </p>
        </div>
        <ButtonLink href="/app/products/new">Add product</ButtonLink>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/app/products/items"
          className="block rounded-3xl border border-ink/10 bg-white p-6 transition hover:border-clay/40"
        >
          <p className="eyebrow text-ink-muted">Items</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">Physical products</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Purchased, stored and counted stock — purchase prices and catalogue
            definitions.
          </p>
          <p className="mt-4 text-sm font-semibold text-clay">
            {itemCount} active item{itemCount === 1 ? "" : "s"} →
          </p>
        </Link>

        <Link
          href="/app/products/dishes"
          className="block rounded-3xl border border-ink/10 bg-white p-6 transition hover:border-clay/40"
        >
          <p className="eyebrow text-ink-muted">Dishes</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">Prepared menu items</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Selling prices, recipes and group-wide dish costs.
          </p>
          <p className="mt-4 text-sm font-semibold text-clay">
            {dishCount} dish{dishCount === 1 ? "" : "es"} →
          </p>
        </Link>

        <Link
          href="/app/products/cost-alerts"
          className="block rounded-3xl border border-ink/10 bg-white p-6 transition hover:border-clay/40"
        >
          <p className="eyebrow text-ink-muted">Cost alerts</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">Food-cost watch</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Warning and critical dishes from live group-wide costing.
          </p>
          <p className="mt-4 text-sm font-semibold text-clay">View alerts →</p>
        </Link>
      </div>

      {!superAdmin ? (
        <Card>
          <p className="text-sm text-ink-muted">
            You can browse Dishes. Creating or editing dishes and selling prices
            is limited to super admins.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
