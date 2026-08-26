import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/*
        Scroll reveals start at opacity 0 and are switched on by JavaScript, so
        without it every section would stay invisible. This hands non-JS
        visitors the fully rendered page instead.
      */}
      <noscript>
        <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <SiteHeader />
      {/* Offset for the floating header. */}
      <main className="flex-1 pt-20 sm:pt-24">{children}</main>
      <SiteFooter />
    </div>
  );
}
