import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  ORDER_APPROVAL_STATUS_LABELS,
  ORDERING_METHOD,
  type OrderApprovalStatus,
} from "@/lib/constants";
import { ensureDemoOrderingCards } from "@/lib/ensure-demo-ordering";
import { listOrderingCardsForHub } from "@/lib/ordering";
import { getOutlets } from "@/lib/queries";
import { ButtonLink, Card } from "@/components/ui";
import { OpenOrderingLinkButton } from "./open-link-button";
import { RequestApprovalForm } from "./request-approval-form";

export const metadata: Metadata = { title: "Purchasing & Orders" };

function MethodBadge({ method }: { method: string }) {
  const label =
    method === ORDERING_METHOD.WHATSAPP
      ? "WhatsApp"
      : method === ORDERING_METHOD.WEBSITE
        ? "Website"
        : "Internal";
  return (
    <span className="rounded-full bg-sage-50 px-2.5 py-1 text-[11px] font-semibold text-sage-800">
      {label}
    </span>
  );
}

export default async function PurchasingHubPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);
  const params = await searchParams;

  await ensureDemoOrderingCards();

  const outlets = superAdmin ? await getOutlets() : [];
  const selectedOutlet = superAdmin
    ? params.outlet && params.outlet !== "all"
      ? params.outlet
      : outlets[0]?.id ?? null
    : user.outletId;

  const cards = await listOrderingCardsForHub(user, {
    outletId: selectedOutlet,
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-ink-muted">Purchasing</p>
          <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
            Purchasing &amp; Orders
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Open the right WhatsApp group or supplier website, place the order
            yourself, then record what actually arrives under Deliveries.
            Opening a link never updates stock.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/app/inventory/delivery" variant="secondary">
            Record delivery
          </ButtonLink>
          {superAdmin ? (
            <>
              <ButtonLink href="/app/purchasing/approvals" variant="secondary">
                Approvals
              </ButtonLink>
              <ButtonLink href="/app/purchasing/suppliers">
                Manage suppliers
              </ButtonLink>
            </>
          ) : (
            <ButtonLink href="/app/purchasing/approvals" variant="secondary">
              My requests
            </ButtonLink>
          )}
        </div>
      </header>

      {superAdmin && outlets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {outlets.map((outlet) => {
            const active = selectedOutlet === outlet.id;
            return (
              <Link
                key={outlet.id}
                href={`/app/purchasing?outlet=${outlet.id}`}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-ink text-cream"
                    : "bg-white text-ink-muted ring-1 ring-ink/10 hover:text-ink"
                }`}
              >
                {outlet.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      <p className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
        Cards marked <strong>Sample</strong> use demo WhatsApp / website links
        for training. They are not verified supplier relationships.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.id} className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="eyebrow text-ink-muted">{card.category}</p>
                <h2 className="mt-1 text-xl font-bold text-ink">{card.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {card.supplier.name}
                  {card.isSample || card.supplier.isSample ? " · Sample" : ""}
                </p>
              </div>
              <MethodBadge method={card.method} />
            </div>

            {card.instructions ? (
              <p className="text-sm leading-relaxed text-ink-muted">
                {card.instructions}
              </p>
            ) : null}

            {card.requiresApproval ? (
              <div className="rounded-xl bg-cream/70 px-3 py-2 text-xs text-ink-muted">
                Office approval required
                {card.approval ? (
                  <>
                    {" · "}
                    {
                      ORDER_APPROVAL_STATUS_LABELS[
                        card.approval.status as OrderApprovalStatus
                      ]
                    }
                  </>
                ) : (
                  " · Not requested yet"
                )}
              </div>
            ) : null}

            <div className="mt-auto space-y-2">
              <OpenOrderingLinkButton
                cardId={card.id}
                outletId={selectedOutlet}
                methodLabel={
                  card.method === ORDERING_METHOD.WHATSAPP
                    ? "WhatsApp"
                    : card.method === ORDERING_METHOD.WEBSITE
                      ? "Website"
                      : "link"
                }
                disabled={!card.canOpenExternal}
                blockedReason={card.openBlockedReason}
              />
              {card.requiresApproval &&
              (!card.approval ||
                card.approval.status === "REJECTED") ? (
                <RequestApprovalForm
                  cardId={card.id}
                  outletId={selectedOutlet}
                />
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {cards.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No ordering cards are enabled for this outlet yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
