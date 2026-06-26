import Link from "next/link";
import type { ReactNode } from "react";
import { getMexcAdapterStatus } from "@/lib/mexc-status";
import { getAlphaConfig } from "@/lib/config";
import { navItems } from "@/lib/route-content";
import { StatusChip } from "./status-chip";

type AlphaShellProps = {
  activePath: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AlphaShell({
  activePath,
  title,
  subtitle,
  children,
}: AlphaShellProps) {
  const config = getAlphaConfig();
  const exchangeStatus = getMexcAdapterStatus();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#0b0d0b] text-zinc-100">
      <div className="flex min-h-screen w-full max-w-full min-w-0">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#101310] px-4 py-5 lg:block">
          <Link href="/" className="mb-7 flex items-center gap-3 px-2">
            <span className="grid size-10 place-items-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-sm font-black text-emerald-200">
              HA
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[0.16em] text-zinc-100">
                Hypermind
              </span>
              <span className="block text-xs text-zinc-500">AlphaDesk</span>
            </span>
          </Link>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.href === activePath;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-emerald-300/12 text-emerald-100 shadow-[inset_3px_0_0_rgba(110,231,183,0.75)]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                  }`}
                >
                  <span className="w-7 rounded border border-white/10 bg-black/20 py-1 text-center text-[10px] font-bold text-zinc-500">
                    {item.shortLabel}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden">
          <header className="sticky top-0 z-20 w-full max-w-full overflow-hidden border-b border-white/10 bg-[#0b0d0b]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Private crypto command center
                </p>
                <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {title}
                </h1>
                <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-zinc-400">
                  {subtitle}
                </p>
              </div>

              <div className="flex min-w-0 flex-wrap gap-2">
                <StatusChip
                  label={config.paperTradingEnabled ? "Paper trading ON" : "Paper trading OFF"}
                  tone={config.paperTradingEnabled ? "green" : "amber"}
                />
                <StatusChip
                  label={config.liveTradingEnabled ? "Live trading ON" : "Live trading OFF"}
                  tone={config.liveTradingEnabled ? "red" : "green"}
                />
                <StatusChip
                  label={config.emergencyStop ? "Emergency stop ON" : "Emergency stop ready"}
                  tone={config.emergencyStop ? "red" : "neutral"}
                />
                <StatusChip
                  label={config.noTradeMode ? "No-trade mode ON" : "No-trade mode OFF"}
                  tone={config.noTradeMode ? "amber" : "neutral"}
                />
                <StatusChip
                  label={exchangeStatus.orderTestMode ? "MEXC test order" : "MEXC mainnet"}
                  tone={exchangeStatus.testnet ? "green" : "red"}
                />
                <form action="/api/auth/logout" method="post">
                  <button
                    className="inline-flex items-center rounded-md border border-white/12 bg-white/6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/10"
                    type="submit"
                  >
                    Lock desk
                  </button>
                </form>
              </div>
            </div>

            <nav className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold ${
                    item.href === activePath
                      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-400"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="w-full max-w-full px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
