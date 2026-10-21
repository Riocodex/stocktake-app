import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { ORDERING_METHOD_LABELS, type OrderingMethod } from "@/lib/constants";
import { listSuppliers } from "@/lib/ordering";
import { getOutlets } from "@/lib/queries";
import { Card } from "@/components/ui";
import { OrderingCardForm, SupplierForm } from "./supplier-forms";

export const metadata: Metadata = { title: "Suppliers & ordering cards" };

export default async function SuppliersAdminPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect("/app/purchasing");

  const [suppliers, outlets] = await Promise.all([
    listSuppliers(user, true),
    getOutlets(),
  ]);

  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
  }));

  return (
    <div className="space-y-10">
      <header>
        <Link
          href="/app/purchasing"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Purchasing
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Suppliers &amp; ordering cards
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          One supplier can have several ordering cards (produce, coffee, bakery).
          Sample rows are demo configurations — not verified relationships.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold text-ink">Add supplier</h2>
          <div className="mt-3">
            <SupplierForm />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">Add ordering card</h2>
          <div className="mt-3">
            <OrderingCardForm suppliers={supplierOptions} outlets={outlets} />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {suppliers.map((supplier) => (
          <Card key={supplier.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">
                  {supplier.name}
                  {supplier.isSample ? (
                    <span className="ml-2 text-xs font-semibold text-amber-800">
                      Sample
                    </span>
                  ) : null}
                  {!supplier.isActive ? (
                    <span className="ml-2 text-xs font-semibold text-ink-muted">
                      Inactive
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-ink-muted">
                  {supplier._count.deliveries} delivery record
                  {supplier._count.deliveries === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <SupplierForm
              supplier={{
                id: supplier.id,
                name: supplier.name,
                notes: supplier.notes,
                isActive: supplier.isActive,
              }}
            />
            <div className="space-y-3 border-t border-ink/8 pt-4">
              <h3 className="text-sm font-semibold text-ink">Ordering cards</h3>
              {supplier.cards.map((card) => (
                <div key={card.id} className="space-y-2">
                  <p className="text-sm text-ink-muted">
                    {card.title} ·{" "}
                    {
                      ORDERING_METHOD_LABELS[
                        card.method as OrderingMethod
                      ] ?? card.method
                    }
                    {card.requiresApproval ? " · approval" : ""}
                    {!card.isActive ? " · inactive" : ""}
                    {card.isSample ? " · sample" : ""}
                  </p>
                  <OrderingCardForm
                    suppliers={supplierOptions}
                    outlets={outlets}
                    card={{
                      id: card.id,
                      supplierId: supplier.id,
                      title: card.title,
                      category: card.category,
                      method: card.method,
                      externalUrl: card.externalUrl,
                      instructions: card.instructions,
                      requiresApproval: card.requiresApproval,
                      isActive: card.isActive,
                      sortOrder: card.sortOrder,
                      outletIds: card.outlets.map((row) => row.outletId),
                    }}
                  />
                </div>
              ))}
              {supplier.cards.length === 0 ? (
                <p className="text-sm text-ink-muted">No cards yet.</p>
              ) : null}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
