import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { AddProductForm } from "@/app/app/inventory/add-product-form";

export const metadata: Metadata = { title: "Add item" };

export default async function NewItemPage() {
  await requireUser();
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/products/items"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Items
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Add an item
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Physical product for purchasing, counting and transfers.
        </p>
      </header>

      <Card className="max-w-xl">
        <AddProductForm categories={categories} />
      </Card>
    </div>
  );
}
