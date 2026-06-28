import {
  Activity,
  Bot,
  ChartCandlestick,
  ClipboardList,
  Command,
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

// Group the flat nav into terminal sections for clearer information scent.
const navGroups: { label: string; hrefs: string[] }[] = [
  { label: "Command", hrefs: ["/", "/dashboard"] },
  { label: "Intelligence", hrefs: ["/watchlist", "/agents", "/trade-ideas"] },
  { label: "Execution", hrefs: ["/risk", "/paper-trading"] },
  { label: "Records", hrefs: ["/journal", "/reports"] },
  { label: "Operations", hrefs: ["/settings", "/system-health", "/cost-control"] },
];

function NavLink({
  item,
  active,
  mobile = false,
}: {
  item: NavItem;
  active: boolean;
  mobile?: boolean;
}) {
  const Icon = navIcons[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-all duration-150 ${
        active
          ? "bg-white/[0.055] text-white"
          : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
      } ${mobile ? "border border-white/[0.06]" : ""}`}
    >
      {active && !mobile ? (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[--ad-accent] shadow-[0_0_10px_var(--ad-accent)]" />
      ) : null}
      <Icon
        aria-hidden
        className={active ? "size-4 text-[--ad-accent]" : "size-4 text-zinc-600 group-hover:text-zinc-400"}
        strokeWidth={1.7}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function MobileNav({ activePath }: { activePath: string }) {
  return (
    <nav aria-label="Mobile navigation" className="flex max-w-full gap-1.5 overflow-x-auto px-3 py-2">
      {navItems.map((item) => (
        <NavLink key={item.href} item={item} active={item.href === activePath} mobile />
      ))}
    </nav>
  );
}

export function AlphaShell({ activePath, title, subtitle, children }: AlphaShellProps) {
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
    <div className="min-h-screen w-full overflow-x-hidden text-zinc-100">
      <a className="ad-skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="flex min-h-screen min-w-0">
        {/* ---------------------------------- Sidebar -------------------- */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[--ad-canvas-2]/80 backdrop-blur-xl lg:flex">
          <Link
            href="/dashboard"
            className="flex h-16 items-center gap-3 border-b border-white/[0.06] px-4"
          >
            <span className="ad-glow grid size-9 place-items-center rounded-xl border border-[--ad-accent]/30 bg-[--ad-accent]/[0.07] font-mono text-sm font-black text-[--ad-accent]">
              A
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-zinc-50">
                AlphaDesk
              </span>
              <span className="ad-eyebrow block truncate">Hypermind Terminal</span>
            </span>
          </Link>

          <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {navGroups.map((group) => {
              const items = navItems.filter((n) => group.hrefs.includes(n.href));
              if (!items.length) return null;
              return (
                <div key={group.label}>
                  <p className="ad-eyebrow mb-1.5 px-2.5">{group.label}</p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink key={item.href} item={item} active={item.href === activePath} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] p-3">
            <div className="ad-card overflow-hidden p-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="ad-eyebrow">Operating mode</span>
                <span className="flex items-center gap-1.5 font-mono font-semibold text-[--ad-accent]">
                  <span className="ad-dot bg-[--ad-accent] text-[--ad-accent]" />
                  PAPER
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[10px]">
                <span className="ad-eyebrow">Live guard</span>
                <span className="font-mono font-semibold text-zinc-300">LOCKED</span>
              </div>
            </div>
            <form action="/api/auth/logout" method="post" className="mt-2">
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-zinc-500 transition hover:border-white/15 hover:text-zinc-200"
                type="submit"
              >
                <LockKeyhole aria-hidden className="size-3.5" strokeWidth={1.7} />
                Lock desk
              </button>
            </form>
          </div>
        </aside>

        {/* ---------------------------------- Main ----------------------- */}
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[--ad-canvas]/85 backdrop-blur-xl">
            <div className="flex min-w-0 flex-col items-stretch gap-2 px-4 py-2.5 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0 sm:px-5 xl:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="shrink-0 text-[15px] font-semibold tracking-tight text-white">
                  {title}
                </h1>
                <span className="hidden h-3.5 w-px bg-white/10 2xl:block" />
                <span className="hidden max-w-md truncate text-xs text-zinc-500 2xl:block">
                  {subtitle}
                </span>
              </div>

              <div className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="hidden items-center gap-1.5 rounded-md border border-white/[0.07] px-2 py-1 text-[10px] text-zinc-500 md:inline-flex">
                  <Command aria-hidden className="size-3" />
                  <span className="font-mono">⌘K</span>
                </span>
                <StateBadge tone={config.paperTradingEnabled ? "positive" : "danger"}>
                  {`Paper ${config.paperTradingEnabled ? "ON" : "OFF"}`}
                </StateBadge>
                <StateBadge tone={config.liveTradingEnabled ? "danger" : "neutral"}>
                  {`Live ${config.liveTradingEnabled ? "ON" : "OFF"}`}
                </StateBadge>
                <StateBadge tone={exchangeStatus.credentialsReady ? "positive" : "warning"}>
                  MEXC {exchangeStatus.credentialsReady ? "connected" : "offline"}
                </StateBadge>
                <StateBadge tone={openAiReady ? "info" : "warning"}>
                  AI {openAiReady ? config.openAiModel : "fallback"}
                </StateBadge>
                <StateBadge tone={environment === "Production" ? "info" : "neutral"}>
                  {environment}
                </StateBadge>
              </div>
            </div>

            <div className="border-t border-white/[0.05] lg:hidden">
              <MobileNav activePath={activePath} />
            </div>
          </header>

          <div
            className="ad-fade-in w-full min-w-0 px-3 py-3 sm:px-4 xl:px-6 xl:py-5"
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
