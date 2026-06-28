import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "positive" | "warning" | "danger" | "neutral" | "info";

const toneStyles: Record<Tone, string> = {
  positive: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
  warning: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
  danger: "border-rose-400/20 bg-rose-400/[0.07] text-rose-300",
  neutral: "border-white/10 bg-white/[0.03] text-zinc-300",
  info: "border-sky-400/20 bg-sky-400/[0.07] text-sky-300",
};

const toneDot: Record<Tone, string> = {
  positive: "bg-emerald-400 text-emerald-400",
  warning: "bg-amber-400 text-amber-400",
  danger: "bg-rose-400 text-rose-400",
  neutral: "bg-zinc-500 text-zinc-500",
  info: "bg-sky-400 text-sky-400",
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
    <section className={`ad-panel ad-fade-up min-w-0 overflow-hidden ${className}`}>
      <header className="flex min-h-12 min-w-0 flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="ad-eyebrow mb-1">{eyebrow ?? "Workspace"}</p>
          <h2 className="truncate text-[13px] font-semibold tracking-tight text-zinc-100">
            {title}
          </h2>
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
  spark,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
  icon?: LucideIcon;
  spark?: number[];
}) {
  const valueColor = {
    positive: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-rose-300",
    neutral: "text-zinc-50",
    info: "text-sky-300",
  }[tone];

  return (
    <div className="group relative min-w-0 border-b border-r border-white/[0.06] bg-transparent px-4 py-4 transition-colors even:border-r-0 last:border-b-0 hover:bg-white/[0.015] sm:px-5 xl:border-b-0 xl:even:border-r xl:last:border-r-0">
      <div className="flex items-center justify-between gap-2">
        <span className="ad-eyebrow flex items-center gap-1.5">
          {Icon ? <Icon aria-hidden className="size-3.5 text-zinc-600" strokeWidth={1.7} /> : null}
          <span className="truncate">{label}</span>
        </span>
        {spark ? <Sparkline data={spark} tone={tone} className="h-5 w-16 opacity-80" /> : null}
      </div>
      <p className={`mt-2.5 truncate font-mono text-[22px] font-semibold leading-none tracking-tight tabular-nums ${valueColor}`}>
        {value}
      </p>
      {detail ? <p className="mt-1.5 truncate text-[11px] text-zinc-500">{detail}</p> : null}
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
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide ${toneStyles[tone]}`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${toneDot[tone].split(" ")[0]}`} /> : null}
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
    positive: "from-emerald-500/80 to-emerald-300",
    warning: "from-amber-500/80 to-amber-300",
    danger: "from-rose-500/80 to-rose-300",
  }[tone];
  const bounded = Math.min(100, Math.max(0, value));

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${fill} transition-[width] duration-500 ease-out`}
        style={{ width: `${bounded}%` }}
      />
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
    <div className="grid min-h-36 place-items-center px-5 py-10 text-center">
      <div>
        <span className="mx-auto grid size-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <Icon className="size-5 text-zinc-500" strokeWidth={1.5} />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-zinc-200">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`ad-skeleton rounded-md ${className}`} />;
}

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
      className="flex flex-col gap-3 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] p-4 text-sm leading-6 text-rose-100 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <p className="min-w-0 break-words">{message}</p>
      {retryable && onRetry ? (
        <button
          className="shrink-0 self-start rounded-md border border-rose-400/30 bg-rose-400/[0.12] px-3 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/20 sm:self-auto"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

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
    danger: "text-rose-300",
    neutral: "text-zinc-400",
    info: "text-sky-300",
  }[tone];

  return (
    <p aria-live="polite" className={`text-sm leading-6 ${accent} ${className}`} role="status">
      {children}
    </p>
  );
}

// ----------------------------------------------------------------------------
// Data-viz primitives
// ----------------------------------------------------------------------------

const sparkStroke: Record<Tone, string> = {
  positive: "#34d399",
  warning: "#fbbf24",
  danger: "#fb7185",
  neutral: "#9aa1ab",
  info: "#38bdf8",
};

// Lightweight inline SVG sparkline / area chart — no chart dependency.
export function Sparkline({
  data,
  tone = "neutral",
  className = "",
  fill = false,
  strokeWidth = 1.5,
}: {
  data: number[];
  tone?: Tone;
  className?: string;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const w = 100;
  const h = 32;
  if (!data.length) {
    return <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className={className} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => {
    const x = i * step;
    const y = h - ((d - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const color = sparkStroke[tone];
  const gid = `sg-${tone}-${data.length}-${Math.round(data[0])}`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Radial gauge for a 0–100 score (risk / confidence).
export function Gauge({
  value,
  label,
  tone = "positive",
  size = 116,
}: {
  value: number;
  label?: string;
  tone?: Exclude<Tone, "neutral">;
  size?: number;
}) {
  const v = Math.min(100, Math.max(0, value));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c * 0.75; // 270° arc
  const color = sparkStroke[tone === "info" ? "info" : tone];

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[135deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
          strokeDasharray={`${c * 0.75} ${c}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">
          {Math.round(v)}
        </span>
        {label ? <span className="ad-eyebrow mt-0.5">{label}</span> : null}
      </div>
    </div>
  );
}
