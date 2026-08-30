import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { assertOutletAccess, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyseStockPhoto, isAiConfigured } from "@/lib/ai";
import { PHOTO_STATUS, STOCK_TAKE_STATUS } from "@/lib/constants";
import { CORS_HEADERS } from "@/lib/cors";
import { applyDetectionsToStockTake, getCatalogueForOutlet } from "@/lib/stock";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const { id } = await context.params;

  const stockTake = await prisma.stockTake.findUnique({ where: { id } });
  if (!stockTake) {
    return NextResponse.json({ error: "Stock take not found." }, { status: 404 });
  }

  try {
    assertOutletAccess(user, stockTake.outletId);
  } catch {
    return NextResponse.json(
      { error: "You do not have access to this outlet." },
      { status: 403 },
    );
  }

  if (stockTake.status === STOCK_TAKE_STATUS.SUBMITTED) {
    return NextResponse.json(
      { error: "This stock take has already been submitted." },
      { status: 409 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That photo is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photos must be under 10MB." },
      { status: 413 },
    );
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type}` },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const fileName = `${stockTake.id}-${randomUUID()}.${extension}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, fileName), bytes);

  const photo = await prisma.stockPhoto.create({
    data: {
      stockTakeId: stockTake.id,
      fileName: file.name || fileName,
      url: `/uploads/${fileName}`,
      status: PHOTO_STATUS.ANALYZING,
    },
  });

  try {
    const catalogue = await getCatalogueForOutlet(stockTake.outletId);
    const analysis = await analyseStockPhoto(
      bytes,
      file.type || "image/jpeg",
      catalogue,
    );

    const applied = await applyDetectionsToStockTake({
      stockTakeId: stockTake.id,
      outletId: stockTake.outletId,
      photoId: photo.id,
      detections: analysis.items,
    });

    const matched = applied.filter((row) => row.itemId !== null).length;

    await prisma.stockPhoto.update({
      where: { id: photo.id },
      data: {
        status: PHOTO_STATUS.ANALYZED,
        provider: analysis.provider,
        rawResponse: JSON.stringify(analysis.raw).slice(0, 20_000),
        detectedCount: analysis.items.length,
        analyzedAt: new Date(),
      },
    });

    return NextResponse.json({
      photoId: photo.id,
      url: photo.url,
      provider: analysis.provider,
      simulated: !isAiConfigured(),
      detected: analysis.items.length,
      matched,
      unmatched: analysis.items.length - matched,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed unexpectedly.";

    await prisma.stockPhoto.update({
      where: { id: photo.id },
      data: {
        status: PHOTO_STATUS.FAILED,
        error: message.slice(0, 500),
        analyzedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: message, photoId: photo.id, url: photo.url },
      { status: 502 },
    );
  }
}
