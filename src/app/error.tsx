"use client";

// Error boundaries must be Client Components in the App Router.
// Next.js 16 passes `unstable_retry` (not `reset`) to recover the segment.
import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface for local debugging only. The message rendered to the operator
    // below is intentionally generic so no internal detail or secret leaks.
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#080a0c] px-4 py-12 text-zinc-100">
      <section
        className="w-full max-w-md rounded-lg border border-red-400/20 bg-[#0d1115] p-6 text-center shadow-2xl shadow-black/30"
        role="alert"
      >
        <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This view could not be displayed. Paper trading, the journal, and your
          local desk state remain safe. No live order was sent and no settings
          were changed.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-zinc-600">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.1] px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/[0.16]"
            onClick={() => unstable_retry()}
            type="button"
          >
            Try again
          </button>
          <a
            className="rounded-md border border-white/[0.09] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.05]"
            href="/dashboard"
          >
            Back to dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
