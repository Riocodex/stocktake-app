import { apiJson, apiOptions, ApiError, handleApiError, requireApiUser } from "@/lib/api";
import { isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";

export function OPTIONS() {
  return apiOptions();
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  STOCK_TAKE_SUBMITTED: "Submitted a stock take",
  PRODUCT_CREATED: "Added a product",
  DELIVERY_RECORDED: "Recorded a delivery",
};

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!isSuperAdmin(user)) {
      throw new ApiError(403, "Only super admins can see the team.");
    }

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
        take: 16,
      }),
    ]);

    const names = new Map(users.map((row) => [row.id, row.name]));

    return apiJson({
      users: users.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        roleLabel: ROLE_LABELS[row.role] ?? row.role,
        outletName:
          row.role === "SUPER_ADMIN" ? "All outlets" : (row.outlet?.name ?? "Unassigned"),
        takeCount: row._count.stockTakes,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      })),
      activity: recentActivity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        label: ACTION_LABELS[entry.action] ?? entry.action,
        detail: entry.detail,
        userName: entry.userId ? names.get(entry.userId) ?? null : null,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
