import { apiJson, apiOptions, ApiError, handleApiError, requireApiUser } from "@/lib/api";
import { isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGroupSummaryByOutlet } from "@/lib/queries";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!isSuperAdmin(user)) {
      throw new ApiError(403, "Only super admins can see every outlet.");
    }

    const [summaries, admins] = await Promise.all([
      getGroupSummaryByOutlet(),
      prisma.user.findMany({
        where: { outletId: { not: null } },
        select: {
          id: true,
          name: true,
          email: true,
          outletId: true,
          lastLoginAt: true,
        },
      }),
    ]);

    return apiJson({
      group: {
        value: summaries.reduce((sum, row) => sum + row.summary.value, 0),
        lowCount: summaries.reduce((sum, row) => sum + row.summary.lowCount, 0),
        takeCount: summaries.reduce((sum, row) => sum + row.summary.takeCount, 0),
      },
      outlets: summaries.map(({ outlet, summary }) => ({
        id: outlet.id,
        name: outlet.name,
        city: outlet.city,
        address: outlet.address,
        value: summary.value,
        lowCount: summary.lowCount,
        draftCount: summary.draftCount,
        takeCount: summary.takeCount,
        lastCountedAt: summary.lastTake?.submittedAt?.toISOString() ?? null,
        admins: admins
          .filter((admin) => admin.outletId === outlet.id)
          .map((admin) => ({
            id: admin.id,
            name: admin.name,
            email: admin.email,
          })),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
