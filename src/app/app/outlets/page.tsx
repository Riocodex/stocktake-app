import Link from "next/link";
import type { Metadata } from "next";

import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGroupSummaryByOutlet } from "@/lib/queries";
import { formatMoney, formatRelative } from "@/lib/format";
import { Badge, Card, StatCard } from "@/components/ui";
import { HamsaMark } from "@/components/brand/marks";

export const metadata: Metadata = { title: "Outlets" };

export default async function OutletsPage() {
  await requireSuperAdmin();

  const [summaries, admins] = await Promise.all([
    getGroupSummaryByOutlet(),
    prisma.user.findMany({
      where: { outletId: { not: null } },
      select: { id: true, name: true, email: true, outletId: true, lastLoginAt: true },
    }),
  ]);

  const groupValue = summaries.reduce(
    (sum, row) => sum + row.summary.value,
    0,
  );
  const groupLow = summaries.reduce((sum, row) => sum + row.summary.lowCount, 0);
  const groupTakes = summaries.reduce(
    (sum, row) => sum + row.summary.takeCount,
    0,
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-clay">Super admin</p>
        <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
          Outlets
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Every venue in the group, with its live stock position and who is
          responsible for counting it.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Group stock value"
          value={formatMoney(groupValue)}
          href="/app/inventory"
        />
        <StatCard
          label="Items needing reorder"
          value={String(groupLow)}
          tone={groupLow > 0 ? "clay" : "sage"}
          hint={
            groupLow > 0
              ? "By outlet"
              : "Nothing below threshold"
          }
          href="/app/inventory/reorder"
        />
        <StatCard
          label="Stock takes filed"
          value={String(groupTakes)}
          tone="ink"
          href="/app/stock-takes?status=submitted"
        />
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {summaries.map(({ outlet, summary }) => {
          const outletAdmins = admins.filter(
            (admin) => admin.outletId === outlet.id,
          );

          return (
            <Card key={outlet.id} className="relative overflow-hidden">
              <HamsaMark
                className="pointer-events-none absolute -top-6 -right-6 w-28 text-sage/12"
                aria-hidden
              />

              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="display-heading text-xl text-ink">
                      {outlet.name}
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      {outlet.address ?? outlet.city}
                    </p>
                  </div>
                  {summary.draftCount > 0 ? (
                    <Badge tone="warn">{summary.draftCount} draft</Badge>
                  ) : (
                    <Badge tone="ok">No open drafts</Badge>
                  )}
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-ink/8 py-4">
                  <div>
                    <dt className="text-[10px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                      Value
                    </dt>
                    <dd className="display-heading mt-1 text-lg text-ink">
                      <Link
                        href={`/app/inventory?outlet=${outlet.id}`}
                        className="transition hover:text-clay"
                      >
                        {formatMoney(summary.value)}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                      Low
                    </dt>
                    <dd className="display-heading mt-1 text-lg text-clay">
                      <Link
                        href={`/app/inventory/reorder?outlet=${outlet.id}`}
                        className="transition hover:opacity-80"
                        title={`View items to reorder at ${outlet.name}`}
                      >
                        {summary.lowCount}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                      Counts
                    </dt>
                    <dd className="display-heading mt-1 text-lg text-sage-700">
                      <Link
                        href={`/app/stock-takes?outlet=${outlet.id}&status=submitted`}
                        className="transition hover:text-clay"
                      >
                        {summary.takeCount}
                      </Link>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <p className="text-[10px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                    Outlet admins
                  </p>
                  <ul className="mt-2 space-y-1">
                    {outletAdmins.length === 0 ? (
                      <li className="text-xs text-ink-muted">
                        No admin assigned yet.
                      </li>
                    ) : (
                      outletAdmins.map((admin) => (
                        <li key={admin.id} className="text-xs text-ink-soft">
                          <span className="font-semibold text-ink">
                            {admin.name}
                          </span>{" "}
                          · {admin.email} ·{" "}
                          {admin.lastLoginAt
                            ? `last in ${formatRelative(admin.lastLoginAt)}`
                            : "never signed in"}
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <p className="mt-4 text-xs text-ink-muted">
                  Last counted{" "}
                  {summary.lastTake
                    ? `${formatRelative(summary.lastTake.submittedAt)} by ${
                        summary.lastTake.user.name
                      }`
                    : "never"}
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/app?outlet=${outlet.id}`}
                    className="rounded-pill bg-clay px-4 py-2 text-xs font-semibold text-white transition hover:bg-clay-600"
                  >
                    Open dashboard
                  </Link>
                  <Link
                    href={`/app/inventory?outlet=${outlet.id}`}
                    className="rounded-pill border border-ink/15 px-4 py-2 text-xs font-semibold text-ink transition hover:border-clay hover:text-clay"
                  >
                    Inventory
                  </Link>
                  <Link
                    href={`/app/stock-takes?outlet=${outlet.id}`}
                    className="rounded-pill border border-ink/15 px-4 py-2 text-xs font-semibold text-ink transition hover:border-clay hover:text-clay"
                  >
                    Stock takes
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
