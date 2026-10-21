import Link from "next/link";
import type { Metadata } from "next";

import { isAiConfigured } from "@/lib/ai";
import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOutlets } from "@/lib/queries";
import { Card } from "@/components/ui";
import { TransferForm } from "../transfer-form";

export const metadata: Metadata = { title: "New transfer" };

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);
  const fromOutletId = superAdmin ? scope.outletId : user.outletId;

  const [outlets, catalogue] = await Promise.all([
    getOutlets(),
    fromOutletId
      ? prisma.inventoryItem.findMany({
          where: { isActive: true },
          include: {
            category: true,
            outletStock: { where: { outletId: fromOutletId } },
          },
          orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const items = catalogue
    .map((item) => {
      const stock = item.outletStock[0];
      return {
        id: item.id,
        name: item.brand ? `${item.brand} ${item.name}` : item.name,
        unit: item.unit,
        category: item.category.name,
        quantity: stock?.quantity ?? 0,
      };
    })
    .filter((item) => item.quantity > 0);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/inventory/transfers"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Transfers
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          New transfer
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Send multiple products to different outlets in one go. Each
          destination gets its own draft. Stock only moves when you press Send.
        </p>
      </header>

      <Card className="max-w-2xl">
        {superAdmin && !fromOutletId ? (
          <p className="text-sm text-ink-muted">
            Pick a source outlet with the switcher on the transfers list, or
            choose “From outlet” below after selecting one in the form.
          </p>
        ) : null}
        <div className="mt-2">
          <TransferForm
            outlets={outlets}
            items={items}
            fixedFromOutletId={fromOutletId}
            fixedFromOutletName={
              superAdmin
                ? outlets.find((outlet) => outlet.id === fromOutletId)?.name ??
                  null
                : user.outletName
            }
            simulatedAi={!isAiConfigured()}
          />
        </div>
      </Card>
    </div>
  );
}
