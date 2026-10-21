import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { getDish } from "@/lib/dishes";
import { Card } from "@/components/ui";
import { DishForm } from "../../../dish-form";

export const metadata: Metadata = { title: "Edit dish" };

export default async function EditDishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!isSuperAdmin(user)) {
    redirect("/app/products/dishes");
  }

  const { id } = await params;
  const result = await getDish(user, id);
  if (!result.ok) notFound();

  const dish = result.dish;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/app/products/dishes/${dish.id}`}
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← {dish.name}
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Edit dish
        </h1>
      </header>

      <Card className="max-w-xl">
        <DishForm
          mode="edit"
          dishId={dish.id}
          defaults={{
            name: dish.name,
            category: dish.category,
            description: dish.description,
            sellingPrice: dish.sellingPrice,
            isActive: dish.isActive,
            imageUrl: dish.imageUrl,
          }}
        />
      </Card>
    </div>
  );
}
