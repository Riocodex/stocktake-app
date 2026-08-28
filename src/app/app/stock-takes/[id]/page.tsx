import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { assertOutletAccess, isSuperAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai";
import {
  AREA_LABELS,
  PHOTO_STATUS,
  STOCK_TAKE_STATUS,
  categoryMatchesArea,
} from "@/lib/constants";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import {
  Badge,
  Card,
  ProgressRing,
  SectionHeading,
} from "@/components/ui";
import { PhotoUploader } from "./photo-uploader";
import { LineEditor, type EditableLine } from "./line-editor";
import {
  DetectionResolver,
  SubmitPanel,
  type CatalogueOption,
  type UnmatchedDetection,
} from "./draft-controls";
import {
  CategoryChecklist,
  type ChecklistCategory,
} from "./category-checklist";
import { CountedPanel } from "./counted-panel";
import {
  DownloadHint,
  DownloadStockTakeButton,
} from "./download-button";

export const metadata: Metadata = { title: "Stock take" };

export default async function StockTakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canEditPrices = isSuperAdmin(user);

  const stockTake = await prisma.stockTake.findUnique({
    where: { id },
    include: {
      outlet: true,
      user: { select: { name: true } },
      photos: { orderBy: { createdAt: "asc" } },
      lines: {
        include: {
          item: { include: { category: true } },
          photo: { select: { url: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!stockTake) notFound();

  try {
    assertOutletAccess(user, stockTake.outletId);
  } catch {
    notFound();
  }

  const isDraft = stockTake.status === STOCK_TAKE_STATUS.DRAFT;
  const areaLabel = AREA_LABELS[stockTake.area] ?? stockTake.area;

  const [unmatchedRaw, categoriesRaw, outletStock] = await Promise.all([
    prisma.photoDetection.findMany({
      where: { stockTakeId: id, status: "UNMATCHED" },
      include: { photo: { select: { url: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { items: { some: { isActive: true } } },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.outletStock.findMany({
      where: { outletId: stockTake.outletId },
      select: { itemId: true, quantity: true, unitPrice: true },
    }),
  ]);

  const stockByItem = new Map(
    outletStock.map((row) => [row.itemId, row] as const),
  );
  const lineByItem = new Map(
    stockTake.lines.map((line) => [line.itemId, line] as const),
  );

  const relevantCategories = categoriesRaw.filter((category) =>
    categoryMatchesArea(category.area, stockTake.area),
  );

  const checklist: ChecklistCategory[] = relevantCategories.map((category) => ({
    id: category.id,
    name: category.name,
    items: category.items.map((item) => {
      const stock = stockByItem.get(item.id);
      const line = lineByItem.get(item.id);
      return {
        id: item.id,
        name: item.brand ? `${item.brand} ${item.name}` : item.name,
        sku: item.sku,
        unit: item.unit,
        onRecord: stock?.quantity ?? 0,
        unitPrice: line?.unitPrice ?? stock?.unitPrice ?? item.referencePrice,
        lineId: line?.id ?? null,
        countedQty: line?.countedQty ?? null,
        imageUrl: item.imageUrl ?? line?.photo?.url ?? null,
      };
    }),
  }));

  const totalItems = checklist.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );
  const countedItems = checklist.reduce(
    (sum, category) =>
      sum + category.items.filter((item) => item.lineId).length,
    0,
  );

  const countedList = stockTake.lines.map((line) => ({
    id: line.itemId,
    name: line.item.brand
      ? `${line.item.brand} ${line.item.name}`
      : line.item.name,
    sku: line.item.sku,
    unit: line.item.unit,
    onRecord: stockByItem.get(line.itemId)?.quantity ?? line.previousQty,
    unitPrice: line.unitPrice,
    lineId: line.id,
    countedQty: line.countedQty,
    imageUrl: line.item.imageUrl ?? line.photo?.url ?? null,
    category: line.item.category.name,
    categoryId: line.item.category.id,
  }));

  const lines: EditableLine[] = stockTake.lines.map((line) => ({
    id: line.id,
    itemName: line.item.brand
      ? `${line.item.brand} ${line.item.name}`
      : line.item.name,
    sku: line.item.sku,
    unit: line.item.unit,
    category: line.item.category.name,
    countedQty: line.countedQty,
    previousQty: line.previousQty,
    unitPrice: line.unitPrice,
    previousPrice: line.previousPrice,
    source: line.source,
    confidence: line.confidence,
    aiLabel: line.aiLabel,
    photoUrl: line.photo?.url ?? null,
  }));

  const unmatched: UnmatchedDetection[] = unmatchedRaw.map((detection) => ({
    id: detection.id,
    label: detection.label,
    quantity: detection.quantity,
    unitPrice: detection.unitPrice,
    unit: detection.unit,
    confidence: detection.confidence,
    photoUrl: detection.photo?.url ?? null,
  }));

  const options: CatalogueOption[] = relevantCategories.flatMap((category) =>
    category.items.map((item) => ({
      id: item.id,
      label: `${item.brand ? `${item.brand} ` : ""}${item.name} (${item.sku})`,
      category: category.name,
      unit: item.unit,
    })),
  );

  const totalValue = lines.reduce(
    (sum, line) => sum + line.countedQty * line.unitPrice,
    0,
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/stock-takes"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← All stock takes
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="display-heading text-3xl text-ink sm:text-4xl">
              {stockTake.reference}
            </h1>
            {isDraft ? (
              <Badge tone="warn">Draft</Badge>
            ) : (
              <Badge tone="ok">Submitted</Badge>
            )}
            <Badge tone="sage">{areaLabel}</Badge>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {stockTake.outlet.name} · started by {stockTake.user.name} ·{" "}
            {formatDateTime(stockTake.createdAt)}
            {stockTake.submittedAt
              ? ` · filed ${formatRelative(stockTake.submittedAt)}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <ProgressRing value={countedItems} total={totalItems} size={80} />
          <div className="text-right">
            <p className="eyebrow text-ink-muted">Progress</p>
            <p className="display-heading mt-1 text-2xl text-ink">
              {countedItems}/{totalItems}
            </p>
            <p className="text-xs text-ink-muted">
              {areaLabel.toLowerCase()} items counted
            </p>
            <p className="mt-1 display-heading text-lg text-clay">
              {formatMoney(totalValue)}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionHeading
              title={`${areaLabel} sections`}
              description={
                isDraft
                  ? "Open a section, count each product, and the bubble turns green when it is on this take."
                  : "Green checks were counted in this session."
              }
            />
            <CategoryChecklist
              stockTakeId={id}
              categories={checklist}
              canEditPrices={canEditPrices}
              editable={isDraft}
            />
          </section>

          {isDraft ? (
            <details className="rounded-3xl border border-ink/8 bg-white px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                Optional: photograph a shelf
              </summary>
              <div className="mt-4">
                <PhotoUploader stockTakeId={id} simulated={!isAiConfigured()} />
              </div>
            </details>
          ) : null}

          {stockTake.photos.length > 0 ? (
            <section>
              <SectionHeading
                title="Photos"
                description={`${stockTake.photos.length} image${
                  stockTake.photos.length === 1 ? "" : "s"
                } attached to this count.`}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {stockTake.photos.map((photo) => (
                  <figure
                    key={photo.id}
                    className="overflow-hidden rounded-2xl border border-ink/8 bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.fileName}
                      className="aspect-square w-full object-cover"
                    />
                    <figcaption className="px-3 py-2">
                      <p className="truncate text-[11px] font-semibold text-ink">
                        {photo.detectedCount} detected
                      </p>
                      <p className="truncate text-[10px] text-ink-muted">
                        {photo.status === PHOTO_STATUS.FAILED
                          ? (photo.error ?? "Analysis failed")
                          : (photo.provider ?? photo.status)}
                      </p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {unmatched.length > 0 && isDraft ? (
            <DetectionResolver detections={unmatched} options={options} />
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {isDraft ? (
            <SubmitPanel
              stockTakeId={id}
              lineCount={lines.length}
              totalValue={totalValue}
              note={stockTake.note}
            />
          ) : (
            <Card className="bg-sage-50">
              <p className="eyebrow text-sage-800">Filed</p>
              <p className="mt-2 text-sm text-ink-soft">
                Submitted {formatDateTime(stockTake.submittedAt)}. Live stock for{" "}
                {stockTake.outlet.name} was updated from these figures.
              </p>
              <div className="mt-4 space-y-2">
                <DownloadStockTakeButton
                  stockTakeId={id}
                  reference={stockTake.reference}
                />
                <DownloadHint totalValue={totalValue} />
              </div>
            </Card>
          )}

          <section>
            <SectionHeading title="Counted items" />
            <CountedPanel items={countedList} />
          </section>
        </div>
      </div>

      {lines.length > 0 && (canEditPrices || !isDraft) ? (
        <section>
          <SectionHeading
            title="Count detail"
            description={
              canEditPrices && isDraft
                ? "Super admins can adjust unit prices here before filing."
                : "Read-only record of this count."
            }
            action={
              !isDraft ? (
                <DownloadStockTakeButton
                  stockTakeId={id}
                  reference={stockTake.reference}
                />
              ) : null
            }
          />
          <LineEditor
            lines={lines}
            editable={isDraft && canEditPrices}
            canEditPrices={canEditPrices}
          />
        </section>
      ) : null}
    </div>
  );
}
