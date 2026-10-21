import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  ORDER_APPROVAL_STATUS,
  ORDER_APPROVAL_STATUS_LABELS,
  type OrderApprovalStatus,
} from "@/lib/constants";
import { listOrderApprovals } from "@/lib/ordering";
import { Card } from "@/components/ui";
import { ReviewApprovalForm } from "./review-form";

export const metadata: Metadata = { title: "Order approvals" };

export default async function ApprovalsPage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);
  const requests = await listOrderApprovals(user);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/purchasing"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Purchasing
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          {superAdmin ? "Approval requests" : "My approval requests"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Approval authorizes opening an external ordering link. It does not
          prove the supplier received an order, and it never changes stock.
        </p>
      </header>

      <div className="space-y-4">
        {requests.map((request) => {
          const status = request.status as OrderApprovalStatus;
          return (
            <Card key={request.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    {request.card.title}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {request.card.supplier.name} · {request.outlet.name}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Requested by {request.requestedBy.name} ·{" "}
                    {request.createdAt.toLocaleString("en-MT")}
                  </p>
                </div>
                <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink">
                  {ORDER_APPROVAL_STATUS_LABELS[status]}
                </span>
              </div>
              {request.note ? (
                <p className="text-sm text-ink-muted">Note: {request.note}</p>
              ) : null}
              {request.expectedItems ? (
                <p className="text-sm text-ink-muted">
                  Expected: {request.expectedItems}
                </p>
              ) : null}
              {request.decisionNote ? (
                <p className="text-sm text-ink-muted">
                  Decision: {request.decisionNote}
                </p>
              ) : null}
              {superAdmin && status === ORDER_APPROVAL_STATUS.PENDING ? (
                <ReviewApprovalForm requestId={request.id} />
              ) : null}
            </Card>
          );
        })}
        {requests.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">No approval requests yet.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
