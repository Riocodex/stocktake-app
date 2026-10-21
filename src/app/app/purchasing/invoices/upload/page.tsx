import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { getOutlets } from "@/lib/queries";
import { isInvoiceAiConfigured } from "@/lib/invoice-ai";
import { Card } from "@/components/ui";
import { UploadInvoiceForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload invoice" };

export default async function UploadInvoicePage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);
  const outlets = superAdmin ? await getOutlets() : [];

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/purchasing/invoices"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Invoices
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Upload invoice
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          JPEG, PNG, WebP, HEIC or PDF up to 10MB. AI extraction is a draft —
          you will review before confirming.
        </p>
      </header>

      {!isInvoiceAiConfigured() ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          Simulation mode (no OPENAI_API_KEY). Extraction returns a
          deterministic sample so you can practise the review flow.
        </p>
      ) : null}

      <Card className="max-w-xl">
        <UploadInvoiceForm
          outlets={outlets}
          fixedOutletId={superAdmin ? null : user.outletId}
          fixedOutletName={superAdmin ? null : user.outletName}
        />
      </Card>
    </div>
  );
}
