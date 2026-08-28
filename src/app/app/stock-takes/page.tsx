import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOutlets } from "@/lib/queries";
import {
  AREA_LABELS,
  STOCK_TAKE_STATUS,
  categoryMatchesArea,
} from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  ProgressRing,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { OutletSwitcher } from "@/components/app/outlet-switcher";

export const metadata: Metadata = { title: "Stock takes" };

export default async function StockTakesPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string; status?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);

  const statusFilter =
    params.status === "draft"
      ? STOCK_TAKE_STATUS.DRAFT
      : params.status === "submitted"
        ? STOCK_TAKE_STATUS.SUBMITTED
        : null;

  const [outlets, stockTakes, categories] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    prisma.stockTake.findMany({
      where: {
        ...(scope.outletId ? { outletId: scope.outletId } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        outlet: { select: { name: true } },
        user: { select: { name: true } },
        lines: { select: { countedQty: true, unitPrice: true, itemId: true } },
      },
    }),
    prisma.category.findMany({
      include: { items: { where: { isActive: true }, select: { id: true } } },
    }),
  ]);

  function progressFor(area: string, countedItemIds: string[]) {
    const countedSet = new Set(countedItemIds);
    const matching = categories.filter((category) =>
      categoryMatchesArea(category.area, area),
    );
    const total = matching.reduce(
      (sum, category) => sum + category.items.length,
      0,
    );
    const counted = matching.reduce(
      (sum, category) =>
        sum + category.items.filter((item) => countedSet.has(item.id)).length,
      0,
    );
    return { counted, total };
  }

  const drafts = stockTakes.filter(
    (take) => take.status === STOCK_TAKE_STATUS.DRAFT,
  );

  const tabs = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts" },
    { key: "submitted", label: "Submitted" },
  ];

  const activeTab = params.status ?? "all";

  function tabHref(key: string) {
    const query = new URLSearchParams();
    if (scope.outletId) query.set("outlet", scope.outletId);
    if (key !== "all") query.set("status", key);
    const string = query.toString();
    return string ? `/app/stock-takes?${string}` : "/app/stock-takes";
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-clay">Counting history</p>
          <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
            Stock takes
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {superAdmin
              ? "Every count filed across the group."
              : `Counts filed for ${user.outletName}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {superAdmin ? (
            <OutletSwitcher outlets={outlets} value={scope.outletId} />
          ) : null}
          <ButtonLink href="/app/stock-takes/new">New stock take</ButtonLink>
        </div>
      </header>

      {drafts.length > 0 && activeTab !== "submitted" ? (
        <section className="grid gap-4 md:grid-cols-2">
          {drafts.map((take) => {
            const progress = progressFor(
              take.area,
              take.lines.map((line) => line.itemId),
            );
            return (
              <Card
                key={take.id}
                className="flex flex-wrap items-center gap-4 p-5"
              >
                <ProgressRing
                  value={progress.counted}
                  total={progress.total}
                  size={72}
                />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow text-clay">Active stock take</p>
                  <p className="display-heading mt-1 text-xl text-ink">
                    {take.reference}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {AREA_LABELS[take.area] ?? take.area}
                    {!scope.outletId ? ` · ${take.outlet.name}` : ""}
                    {" · "}
                    {progress.counted} of {progress.total} items
                  </p>
                </div>
                <ButtonLink href={`/app/stock-takes/${take.id}`} size="sm">
                  Continue
                </ButtonLink>
              </Card>
            );
          })}
        </section>
      ) : null}

      <div className="flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tabHref(tab.key)}
            className={
              activeTab === tab.key
                ? "rounded-pill bg-ink px-4 py-1.5 text-xs font-bold text-cream"
                : "rounded-pill border border-ink/15 px-4 py-1.5 text-xs font-bold text-ink-soft transition hover:border-clay hover:text-clay"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {stockTakes.length === 0 ? (
        <EmptyState
          title="No stock takes here yet"
          description="Start a bar or kitchen count and work through each section."
          action={
            <ButtonLink href="/app/stock-takes/new">
              Start a stock take
            </ButtonLink>
          }
        />
      ) : (
        <TableShell
          head={
            <>
              <Th>Reference</Th>
              {!scope.outletId ? <Th>Outlet</Th> : null}
              <Th>Section</Th>
              <Th>Counted by</Th>
              <Th className="text-right">Lines</Th>
              <Th className="text-right">Value</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </>
          }
        >
          {stockTakes.map((take) => {
            const value = take.lines.reduce(
              (sum, line) => sum + line.countedQty * line.unitPrice,
              0,
            );

            return (
              <tr key={take.id} className="transition-colors hover:bg-cream/60">
                <Td>
                  <Link
                    href={`/app/stock-takes/${take.id}`}
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {take.reference}
                  </Link>
                </Td>
                {!scope.outletId ? <Td>{take.outlet.name}</Td> : null}
                <Td>
                  <Badge tone="sage">
                    {AREA_LABELS[take.area] ?? take.area}
                  </Badge>
                </Td>
                <Td>{take.user.name}</Td>
                <Td className="text-right">{take.lines.length}</Td>
                <Td className="text-right font-semibold text-ink">
                  {formatMoney(value)}
                </Td>
                <Td>
                  {take.status === STOCK_TAKE_STATUS.SUBMITTED ? (
                    <Badge tone="ok">Submitted</Badge>
                  ) : (
                    <Badge tone="warn">Draft</Badge>
                  )}
                </Td>
                <Td className="text-xs whitespace-nowrap">
                  {formatDateTime(take.submittedAt ?? take.createdAt)}
                </Td>
              </tr>
            );
          })}
        </TableShell>
      )}
    </div>
  );
}
