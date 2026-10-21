import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { isSuperAdmin } from "@/lib/auth";
import {
  OrderingError,
  createOrderingCard,
  createSupplier,
  listSuppliers,
  updateOrderingCard,
  updateSupplier,
} from "@/lib/ordering";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!isSuperAdmin(user)) {
      throw new ApiError(403, "Only super admins can manage suppliers.");
    }
    const suppliers = await listSuppliers(user, true);
    return apiJson({ suppliers });
  } catch (error) {
    if (error instanceof OrderingError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!isSuperAdmin(user)) {
      throw new ApiError(403, "Only super admins can manage suppliers.");
    }

    const body = await readJson<{
      kind?: string;
      supplierId?: string;
      cardId?: string;
      name?: string;
      notes?: string | null;
      isActive?: boolean;
      title?: string;
      category?: string;
      method?: string;
      externalUrl?: string | null;
      instructions?: string | null;
      requiresApproval?: boolean;
      sortOrder?: number;
      outletIds?: string[];
    }>(request);

    if (body.kind === "card") {
      if (body.cardId) {
        const card = await updateOrderingCard(user, body.cardId, body);
        return apiJson({ card });
      }
      const card = await createOrderingCard(user, {
        supplierId: String(body.supplierId ?? ""),
        title: String(body.title ?? ""),
        category: String(body.category ?? ""),
        method: String(body.method ?? ""),
        externalUrl: body.externalUrl,
        instructions: body.instructions,
        requiresApproval: body.requiresApproval,
        isActive: body.isActive,
        sortOrder: body.sortOrder,
        outletIds: body.outletIds,
      });
      return apiJson({ card });
    }

    if (body.supplierId) {
      const supplier = await updateSupplier(user, body.supplierId, {
        name: body.name,
        notes: body.notes,
        isActive: body.isActive,
      });
      return apiJson({ supplier });
    }

    const supplier = await createSupplier(user, {
      name: String(body.name ?? ""),
      notes: body.notes,
    });
    return apiJson({ supplier });
  } catch (error) {
    if (error instanceof OrderingError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
