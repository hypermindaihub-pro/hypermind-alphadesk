import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "positive" | "warning" | "danger" | "neutral" | "info";

const toneStyles: Record<Tone, string> = {
  positive: "border-emerald-400/25 bg-emerald-400/8 text-emerald-300",
  warning: "border-amber-400/25 bg-amber-400/8 text-amber-300",
  danger: "border-red-400/25 bg-red-400/8 text-red-300",
  neutral: "border-white/10 bg-white/[0.025] text-zinc-300",
  info: "border-sky-400/25 bg-sky-400/8 text-sky-300",
};

export function TerminalPanel({
  title,
  description,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-md border border-white/[0.08] bg-[#0d1115] ${className}`}
    >
      <header className="flex min-h-12 min-w-0 flex-col gap-3 border-b border-white/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-600">{eyebrow}</p>
          ) : null}
          <h2 className="truncate text-[13px] font-semibold text-zinc-100">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function MetricCell({
  label,
  value,
  detail,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const valueColor = {
    positive: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-red-300",
    neutral: "text-zinc-100",
    info: "text-sky-300",
  }[tone];

  return (
    <div className="min-w-0 border-b border-r border-white/[0.07] bg-[#0d1115] px-3 py-3.5 even:border-r-0 last:border-b-0 sm:px-4 xl:border-b-0 xl:border-r xl:even:border-r xl:last:border-r-0">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-zinc-600">
        {Icon ? <Icon aria-hidden className="size-3.5" strokeWidth={1.7} /> : null}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-2 truncate font-mono text-xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
      {detail ? <p className="mt-1 truncate text-[11px] text-zinc-500">{detail}</p> : null}
    </div>
  );
}

export function StateBadge({
  children,
  tone = "neutral",
  dot = true,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  const dotColor = {
    positive: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
    neutral: "bg-zinc-500",
    info: "bg-sky-400",
  }[tone];

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded border px-2 text-[10px] font-semibold uppercase ${toneStyles[tone]}`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${dotColor}`} /> : null}
      {children}
    </span>
  );
}

export function ProgressMeter({
  value,
  tone = "positive",
}: {
  value: number;
  tone?: Exclude<Tone, "neutral" | "info">;
}) {
  const fill = {
    positive: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
  }[tone];
  const bounded = Math.min(100, Math.max(0, value));

  return (
    <div className="h-1.5 overflow-hidden rounded-sm bg-white/[0.06]">
      <div className={`h-full ${fill}`} style={{ width: `${bounded}%` }} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="grid min-h-36 place-items-center px-5 py-8 text-center">
      <div>
        <Icon className="mx-auto size-5 text-zinc-600" strokeWidth={1.5} />
        <h3 className="mt-3 text-sm font-semibold text-zinc-200">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

// A placeholder block that holds layout dimensions while async content loads.
// Honors prefers-reduced-motion via the `.ad-skeleton` rule in globals.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`ad-skeleton rounded bg-white/[0.05] ${className}`}
    />
  );
}

// Sanitized error surface with an optional retry. Used by async panels so an
// API failure never collapses into a false success or a blank panel.
export function AsyncError({
  message,
  onRetry,
  retryable = true,
}: {
  message: string;
  onRetry?: () => void;
  retryable?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-red-400/25 bg-red-400/[0.06] p-4 text-sm leading-6 text-red-100 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <p className="min-w-0 break-words">{message}</p>
      {retryable && onRetry ? (
        <button
          className="shrink-0 self-start rounded border border-red-400/30 bg-red-400/[0.12] px-3 py-1.5 text-[11px] font-semibold text-red-100 transition hover:bg-red-400/20 sm:self-auto"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

// Polite live region for async status text so screen readers announce
// loading / success / error transitions that are otherwise colour-only.
export function LiveStatus({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const accent = {
    positive: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-red-300",
    neutral: "text-zinc-400",
    info: "text-sky-300",
  }[tone];

  return (
    <p
      aria-live="polite"
      className={`text-sm leading-6 ${accent} ${className}`}
      role="status"
    >
      {children}
    </p>
  );
}
