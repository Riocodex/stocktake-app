import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import {
  WASTAGE_REASON_LABELS,
  type WastageReason,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { getOutlets } from "@/lib/queries";
import { listWastage } from "@/lib/wastage";
import { OutletSwitcher } from "@/components/app/outlet-switcher";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  StatCard,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { WastageForm } from "../wastage-form";

export const metadata: Metadata = { title: "Wastage" };

export default async function WastagePage({
  searchParams,
}: {
  searchParams: Promise<{
    outlet?: string;
    q?: string;
    reason?: string;
    itemId?: string;
    from?: string;
    to?: string;
    record?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);
  const showForm = params.record === "1" || params.record === "true";
  // Wastage on-hand figures are always for one outlet. Never invent a fake
  // outlet id (e.g. "__none__") or sum across venues.
  const formOutletId = superAdmin ? scope.outletId : user.outletId;

  const [outlets, catalogue, data] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    formOutletId
      ? prisma.inventoryItem.findMany({
          where: { isActive: true },
          include: {
            category: true,
            outletStock: {
              where: { outletId: formOutletId },
            },
          },
          orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        })
      : Promise.resolve([]),
    listWastage(user, {
      outletId: scope.outletId,
      q: params.q,
      reason: params.reason,
      itemId: params.itemId,
      from: params.from,
      to: params.to,
    }),
  ]);

  const formItems = catalogue.map((item) => {
    const stock = item.outletStock[0] ?? null;
    return {
      id: item.id,
      name: item.brand ? `${item.brand} ${item.name}` : item.name,
      unit: item.unit,
      category: item.category.name,
      quantity: stock?.quantity ?? 0,
      unitPrice:
        stock?.unitPrice && stock.unitPrice > 0
          ? stock.unitPrice
          : item.referencePrice,
    };
  });

  const filterHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      outlet: scope.outletId ?? undefined,
      q: params.q,
      reason: params.reason,
      itemId: params.itemId,
      from: params.from,
      to: params.to,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/app/inventory/wastage?${query}` : "/app/inventory/wastage";
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/inventory"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Inventory
          </Link>
          <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
            Wastage
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Record spoiled, expired or damaged stock. Quantities leave live
            inventory immediately.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {superAdmin ? (
            <OutletSwitcher outlets={outlets} value={scope.outletId} />
          ) : null}
          <ButtonLink href={filterHref({ record: showForm ? undefined : "1" })}>
            {showForm ? "Hide form" : "Record wastage"}
          </ButtonLink>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Wastage today"
          value={formatMoney(data.summary.todayValue)}
          tone="clay"
        />
        <StatCard
          label="Items wasted today"
          value={String(data.summary.todayCount)}
          tone="ink"
        />
        <StatCard
          label="Most wasted today"
          value={data.summary.mostWastedName ?? "—"}
          tone="sage"
        />
      </section>

      {showForm ? (
        <Card className="max-w-2xl">
          <h2 className="text-lg font-bold text-ink">Record item wastage</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Stock cannot go negative. Cost is taken from the outlet price at the
            time of recording.
          </p>
          <div className="mt-5">
            <WastageForm
              key={formOutletId ?? "no-outlet"}
              outlets={outlets}
              items={formItems}
              fixedOutletId={formOutletId}
              fixedOutletName={
                superAdmin
                  ? outlets.find((outlet) => outlet.id === formOutletId)?.name ??
                    null
                  : user.outletName
              }
              recordPath="/app/inventory/wastage"
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <form
          method="get"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {scope.outletId ? (
            <input type="hidden" name="outlet" value={scope.outletId} />
          ) : null}
          <div className="lg:col-span-2">
            <label htmlFor="q" className="eyebrow mb-1.5 block text-ink-muted">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Product or note"
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
            />
          </div>
          <div>
            <label
              htmlFor="reason"
              className="eyebrow mb-1.5 block text-ink-muted"
            >
              Reason
            </label>
            <select
              id="reason"
              name="reason"
              defaultValue={params.reason ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
            >
              <option value="">All</option>
              {(Object.keys(WASTAGE_REASON_LABELS) as WastageReason[]).map(
                (reason) => (
                  <option key={reason} value={reason}>
                    {WASTAGE_REASON_LABELS[reason]}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="eyebrow mb-1.5 block text-ink-muted">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={params.from ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
            />
          </div>
          <div>
            <label htmlFor="to" className="eyebrow mb-1.5 block text-ink-muted">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={params.to ?? ""}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              Apply filters
            </button>
            <Link
              href={
                scope.outletId
                  ? `/app/inventory/wastage?outlet=${scope.outletId}`
                  : "/app/inventory/wastage"
              }
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              Clear
            </Link>
          </div>
        </form>
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState
          title="No wastage recorded"
          description="When stock is spoiled, expired or damaged, record it here so inventory stays accurate."
        />
      ) : (
        <TableShell
          head={
            <>
              <Th>When</Th>
              <Th>Product</Th>
              <Th>Qty</Th>
              <Th>Reason</Th>
              {superAdmin && !scope.outletId ? <Th>Outlet</Th> : null}
              <Th>By</Th>
              <Th className="text-right">Value</Th>
            </>
          }
        >
          {data.rows.map((row) => (
            <tr key={row.id} className="border-t border-ink/6">
              <Td className="whitespace-nowrap text-ink-muted">
                {formatDateTime(row.createdAt)}
              </Td>
              <Td>
                <Link
                  href={`/app/inventory/${row.itemId}`}
                  className="font-semibold text-ink hover:text-clay"
                >
                  {row.itemName}
                </Link>
                {row.note ? (
                  <p className="mt-0.5 text-xs text-ink-muted">{row.note}</p>
                ) : null}
              </Td>
              <Td>
                {formatQty(row.quantity)} {row.unit}
              </Td>
              <Td>
                <Badge tone="warn">{row.reasonLabel}</Badge>
              </Td>
              {superAdmin && !scope.outletId ? (
                <Td className="text-ink-soft">{row.outletName}</Td>
              ) : null}
              <Td className="text-ink-soft">{row.recordedBy}</Td>
              <Td className="text-right font-semibold">
                {formatMoney(row.value)}
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}
