import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/app/app-nav";

export const metadata: Metadata = {
  title: {
    default: "Stock Take",
    template: "%s · TRiBE Stock Take",
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-cream lg:flex-row">
      <AppNav user={user} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
