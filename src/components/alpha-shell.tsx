import {
  Activity,
  Bell,
  Bot,
  ChartCandlestick,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  LockKeyhole,
  Newspaper,
  Radar,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getMexcAdapterStatus } from "@/lib/mexc-status";
import { getAlphaConfig } from "@/lib/config";
import { navItems, type NavItem } from "@/lib/route-content";
import { StateBadge } from "./trading-ui";

type AlphaShellProps = {
  activePath: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

const navIcons: Record<NavItem["icon"], LucideIcon> = {
  activity: Activity,
  agents: Bot,
  dashboard: LayoutDashboard,
  health: HeartPulse,
  ideas: Lightbulb,
  journal: ClipboardList,
  reports: Newspaper,
  risk: ShieldCheck,
  settings: Settings,
  trade: ChartCandlestick,
  watchlist: Radar,
};

function Navigation({ activePath, mobile = false }: { activePath: string; mobile?: boolean }) {
  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
      className={mobile ? "flex max-w-full gap-1 overflow-x-auto px-3 py-2" : "space-y-0.5"}
    >
      {navItems.map((item) => {
        const active = item.href === activePath;
        const Icon = navIcons[item.icon];

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-2.5 rounded px-2.5 py-2 text-xs font-medium transition ${
              active
                ? "bg-white/[0.07] text-white"
                : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200"
            } ${mobile ? "border border-white/[0.06]" : ""}`}
          >
            <Icon
              aria-hidden
              className={active ? "size-4 text-emerald-400" : "size-4 text-zinc-600 group-hover:text-zinc-400"}
              strokeWidth={1.7}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AlphaShell({
  activePath,
  title,
  subtitle,
  children,
}: AlphaShellProps) {
  const config = getAlphaConfig();
  const exchangeStatus = getMexcAdapterStatus();
  const openAiReady = Boolean(process.env.OPENAI_API_KEY?.trim());
  const environment =
    process.env.VERCEL_ENV === "production"
      ? "Production"
      : process.env.NODE_ENV === "production"
        ? "Staging"
        : "Development";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#080a0c] text-zinc-100">
      <a className="ad-skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="flex min-h-screen min-w-0">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-white/[0.07] bg-[#090c0f] lg:flex lg:flex-col">
          <Link href="/dashboard" className="flex h-16 items-center gap-3 border-b border-white/[0.07] px-4">
            <span className="grid size-8 place-items-center rounded border border-emerald-400/25 bg-emerald-400/[0.08] font-mono text-xs font-black text-emerald-300">
              H
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-100">Hypermind</span>
              <span className="block truncate text-[11px] text-zinc-600">AlphaDesk</span>
            </span>
          </Link>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <p className="mb-2 px-2.5 text-[9px] font-semibold uppercase text-zinc-700">Workspace</p>
            <Navigation activePath={activePath} />
          </div>

          <div className="border-t border-white/[0.07] p-3">
            <div className="rounded border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-600">Operating mode</span>
                <span className="font-mono text-emerald-400">PAPER</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-zinc-600">System</span>
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Operational
                </span>
              </div>
            </div>
            <form action="/api/auth/logout" method="post" className="mt-2">
              <button
                className="flex w-full items-center justify-center gap-2 rounded border border-white/[0.08] px-3 py-2 text-xs text-zinc-500 transition hover:border-white/15 hover:text-zinc-200"
                type="submit"
              >
                <LockKeyhole aria-hidden className="size-3.5" strokeWidth={1.7} />
                Lock desk
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080a0c]/95 backdrop-blur">
            <div className="flex min-w-0 flex-col items-stretch gap-2 px-4 py-2 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0 sm:px-5 xl:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="shrink-0 text-base font-semibold text-white">{title}</h1>
                  <span className="hidden text-zinc-800 2xl:inline">/</span>
                  <span className="hidden truncate text-xs text-zinc-600 2xl:inline">{subtitle}</span>
                </div>
              </div>

              <div className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <StateBadge tone={config.paperTradingEnabled ? "positive" : "danger"}>
                  {`Paper trading ${config.paperTradingEnabled ? "ON" : "OFF"}`}
                </StateBadge>
                <StateBadge tone={config.liveTradingEnabled ? "danger" : "neutral"}>
                  {`Live trading ${config.liveTradingEnabled ? "ON" : "OFF"}`}
                </StateBadge>
                <StateBadge tone={exchangeStatus.credentialsReady ? "positive" : "warning"}>
                  MEXC {exchangeStatus.credentialsReady ? "connected" : "disconnected"}
                </StateBadge>
                <StateBadge tone={openAiReady ? "positive" : "warning"}>
                  AI {openAiReady ? config.openAiModel : "fallback"}
                </StateBadge>
                <StateBadge tone={environment === "Production" ? "info" : "neutral"}>
                  {environment}
                </StateBadge>
                <button
                  aria-label="Notifications"
                  className="ml-1 grid size-8 place-items-center rounded border border-white/[0.07] text-zinc-600 transition hover:text-zinc-200"
                  title="Notifications"
                  type="button"
                >
                  <Bell aria-hidden className="size-4" strokeWidth={1.7} />
                </button>
              </div>
            </div>

            <div className="border-t border-white/[0.05] lg:hidden">
              <Navigation activePath={activePath} mobile />
            </div>
          </header>

          <div
            className="w-full min-w-0 px-3 py-3 sm:px-4 xl:px-5 xl:py-4"
            id="main-content"
            tabIndex={-1}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
