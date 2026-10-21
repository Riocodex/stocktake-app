import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Add product" };

export default async function AddProductChooserPage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/products"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Products &amp; Dishes
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          What would you like to add?
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Items are physical stock. Dishes are prepared menu products.
        </p>
      </header>

      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Link
          href="/app/products/items/new"
          className="block rounded-3xl border border-ink/10 bg-white p-6 transition hover:border-clay/40"
        >
          <p className="eyebrow text-ink-muted">Item</p>
          <h2 className="mt-2 text-xl font-bold text-ink">Physical product</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Strawberries, milk, vodka — can be purchased, counted and transferred.
          </p>
        </Link>

        {superAdmin ? (
          <Link
            href="/app/products/dishes/new"
            className="block rounded-3xl border border-ink/10 bg-white p-6 transition hover:border-clay/40"
          >
            <p className="eyebrow text-ink-muted">Dish</p>
            <h2 className="mt-2 text-xl font-bold text-ink">Prepared product</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Smoothies, burgers, cocktails — selling price now; recipes later.
            </p>
          </Link>
        ) : (
          <Card className="opacity-80">
            <p className="eyebrow text-ink-muted">Dish</p>
            <h2 className="mt-2 text-xl font-bold text-ink">Prepared product</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Only super admins can create dishes.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
