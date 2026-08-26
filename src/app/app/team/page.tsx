import type { Metadata } from "next";

import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { Badge, Card, TableShell, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  await requireSuperAdmin();

  const [users, recentActivity] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: {
        outlet: { select: { name: true } },
        _count: { select: { stockTakes: true } },
      },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const userNames = new Map(users.map((user) => [user.id, user.name]));

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-clay">Super admin</p>
        <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
          Team access
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Outlet admins can only see and count their own venue. Super admins see
          every outlet and the group-wide inventory.
        </p>
      </header>

      <TableShell
        head={
          <>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Access</Th>
            <Th>Outlet</Th>
            <Th className="text-right">Stock takes</Th>
            <Th>Last signed in</Th>
            <Th>Joined</Th>
          </>
        }
      >
        {users.map((user) => (
          <tr key={user.id} className="transition-colors hover:bg-cream/60">
            <Td className="font-semibold text-ink">{user.name}</Td>
            <Td className="text-xs">{user.email}</Td>
            <Td>
              <Badge tone={user.role === ROLES.SUPER_ADMIN ? "clay" : "sage"}>
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            </Td>
            <Td className="text-xs">
              {user.role === ROLES.SUPER_ADMIN
                ? "All outlets"
                : (user.outlet?.name ?? "Unassigned")}
            </Td>
            <Td className="text-right">{user._count.stockTakes}</Td>
            <Td className="text-xs whitespace-nowrap">
              {formatRelative(user.lastLoginAt)}
            </Td>
            <Td className="text-xs whitespace-nowrap">
              {formatDate(user.createdAt)}
            </Td>
          </tr>
        ))}
      </TableShell>

      <section>
        <h2 className="display-heading mb-4 text-xl text-ink">Recent activity</h2>
        {recentActivity.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">No activity recorded yet.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-ink/6 p-0">
            {recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {entry.action === "LOGIN"
                      ? "Signed in"
                      : entry.action === "STOCK_TAKE_SUBMITTED"
                        ? "Submitted a stock take"
                        : entry.action}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {(entry.userId ? userNames.get(entry.userId) : null) ??
                      "Unknown user"}
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {formatRelative(entry.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
