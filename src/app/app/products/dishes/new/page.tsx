import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import { DishForm } from "../../dish-form";

export const metadata: Metadata = { title: "Add dish" };

export default async function NewDishPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) {
    redirect("/app/products/dishes");
  }

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/products/dishes"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Dishes
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Add a dish
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Selling price only for now. Recipe ingredients and dish cost come in a
          later step.
        </p>
      </header>

      <Card className="max-w-xl">
        <DishForm mode="create" />
      </Card>
    </div>
  );
}
