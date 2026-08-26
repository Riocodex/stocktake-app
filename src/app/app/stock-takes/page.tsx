import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOutlets } from "@/lib/queries";
import { STOCK_TAKE_STATUS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  Badge,
  ButtonLink,
  EmptyState,
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

  const [outlets, stockTakes] = await Promise.all([
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
        lines: { select: { countedQty: true, unitPrice: true, source: true } },
        _count: { select: { photos: true } },
      },
    }),
  ]);

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
          description="Start a count, photograph your shelves, and the AI will do the counting."
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
              <Th>Counted by</Th>
              <Th className="text-right">Lines</Th>
              <Th className="text-right">AI</Th>
              <Th className="text-right">Photos</Th>
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
            const aiCount = take.lines.filter(
              (line) => line.source === "AI",
            ).length;

            return (
              <tr key={take.id} className="transition-colors hover:bg-cream/60">
                <Td>
                  <Link
                    href={`/app/stock-takes/${take.id}`}
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {take.reference}
                  </Link>
                  {take.note ? (
                    <span className="block max-w-[16rem] truncate text-[11px] text-ink-muted">
                      {take.note}
                    </span>
                  ) : null}
                </Td>
                {!scope.outletId ? <Td>{take.outlet.name}</Td> : null}
                <Td>{take.user.name}</Td>
                <Td className="text-right">{take.lines.length}</Td>
                <Td className="text-right text-xs text-sage-700">
                  {take.lines.length > 0
                    ? `${Math.round((aiCount / take.lines.length) * 100)}%`
                    : "—"}
                </Td>
                <Td className="text-right">{take._count.photos}</Td>
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
