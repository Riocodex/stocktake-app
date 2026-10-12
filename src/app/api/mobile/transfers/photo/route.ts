import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  requireApiUser,
} from "@/lib/api";
import { analyzeTransferPhoto } from "@/lib/transfers";
import { saveUploadedImage } from "@/lib/uploads";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const formData = await request.formData();
    const outletId = String(formData.get("outletId") ?? "").trim();
    const file = formData.get("photo");

    if (!(file instanceof File)) {
      throw new ApiError(400, "No photo was uploaded.");
    }

    const imageUrl = await saveUploadedImage(file, "transfers");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await analyzeTransferPhoto(user, {
      outletId,
      bytes,
      mimeType: file.type || "image/jpeg",
      imageUrl,
    });

    if (!result.ok) {
      throw new ApiError(400, result.error ?? "Could not analyse photo.");
    }

    return apiJson(result);
  } catch (error) {
    return handleApiError(error);
  }
}
