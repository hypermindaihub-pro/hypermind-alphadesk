import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#080a0c] px-4 py-12 text-zinc-100">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-[#0d1115] p-6 text-center shadow-2xl shadow-black/30">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
          404
        </p>
        <h1 className="mt-3 text-lg font-semibold text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          That route is not part of the AlphaDesk workstation. Use the links
          below to return to a known view.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.1] px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/[0.16]"
            href="/dashboard"
          >
            Go to dashboard
          </Link>
          <Link
            className="rounded-md border border-white/[0.09] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.05]"
            href="/watchlist"
          >
            Market scanner
          </Link>
        </div>
      </section>
    </main>
  );
}
