import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-6">
      <div className="max-w-md text-center">
        <p className="eyebrow text-clay">404</p>
        <h1 className="display-heading mt-3 text-4xl text-ink">
          That page is not here
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          The link may be old, or the stock take was removed.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-pill bg-clay px-5 py-2.5 text-sm font-semibold text-white"
          >
            TRiBE website
          </Link>
          <Link
            href="/app"
            className="rounded-pill border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Stock take
          </Link>
        </div>
      </div>
    </main>
  );
}
