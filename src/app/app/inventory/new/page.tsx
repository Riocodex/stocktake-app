import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { AddProductForm } from "../add-product-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireUser();
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

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
          Add a product
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Name, unit and price are enough to get it onto the next stock take.
        </p>
      </header>

      <Card className="max-w-xl">
        <AddProductForm categories={categories} />
      </Card>
    </div>
  );
}
