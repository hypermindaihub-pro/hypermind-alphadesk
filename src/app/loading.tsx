import { Skeleton } from "@/components/trading-ui";

// Presentation-only Suspense fallback for authenticated route segments. It
// mirrors the AlphaShell silhouette so streamed content swaps in without layout
// shift. No data access and no auth logic live here.
export default function Loading() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#080a0c] text-zinc-100">
      <div className="flex min-h-screen min-w-0">
        <aside className="hidden h-screen w-56 shrink-0 border-r border-white/[0.07] bg-[#090c0f] lg:block">
          <div className="flex h-16 items-center gap-3 border-b border-white/[0.07] px-4">
            <Skeleton className="size-8" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-2 px-3 py-4">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton className="h-8 w-full" key={index} />
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/[0.07] px-4 sm:px-5">
            <Skeleton className="h-5 w-40" />
            <div className="hidden gap-1.5 sm:flex">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton className="h-6 w-24" key={index} />
              ))}
            </div>
          </header>

          <div className="space-y-3 px-3 py-3 sm:px-4 xl:px-5 xl:py-4">
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.08] xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton className="h-20 w-full rounded-none" key={index} />
              ))}
            </div>
            <Skeleton className="h-72 w-full" />
            <div className="grid gap-3 xl:grid-cols-2">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          </div>
        </main>
      </div>
      <span className="ad-sr-only" role="status">
        Loading AlphaDesk workstation.
      </span>
    </div>
  );
}
