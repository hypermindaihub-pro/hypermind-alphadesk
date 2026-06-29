"use client";

// Leaf presentational primitives shared across the command-center views.
// Extracted from the command-center monolith so views can be split out
// incrementally without each one redefining its own buttons and panels.

import { Clock3, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ProgressMeter, StateBadge } from "../trading-ui";

export function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="ad-panel ad-fade-up min-w-0 overflow-hidden">
      <div className="flex min-w-0 flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-100">{title}</h2>
          {description ? (
            <p className="mt-1 break-words text-xs leading-5 text-zinc-500">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const className = {
    primary:
      "border-[--ad-accent]/25 bg-[--ad-accent]/[0.08] text-[--ad-accent] hover:bg-[--ad-accent]/[0.14]",
    secondary: "border-white/[0.09] bg-white/[0.025] text-zinc-300 hover:bg-white/[0.06] hover:border-white/15",
    danger: "border-rose-400/30 bg-rose-400/[0.08] text-rose-200 hover:bg-rose-400/[0.16]",
  }[variant];

  return (
    <button
      className={`inline-flex min-h-8 items-center justify-center rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-semibold uppercase text-zinc-600">
        {label}
      </span>
      <input
        className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.09] bg-[--ad-inset] px-3 text-xs text-white outline-none transition placeholder:text-zinc-700 focus:border-[--ad-accent]/40 focus:ring-2 focus:ring-[--ad-accent]/10"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

export function AgentStatusCard({
  title,
  icon: Icon,
  status,
  recommendation,
  confidence,
  lastRun,
  onRun,
  loading,
  tone = "positive",
  source,
  synthetic = false,
}: {
  title: string;
  icon: LucideIcon;
  status: string;
  recommendation: string;
  confidence: number;
  lastRun: string;
  onRun?: () => void;
  loading: boolean;
  tone?: "positive" | "warning" | "danger" | "neutral" | "info";
  source: string;
  // `synthetic` marks a card that is a deterministic local synthesis, not a
  // separate OpenAI call. It replaces the "Run agent" button with a static
  // label so the UI never implies an API request that does not happen.
  synthetic?: boolean;
}) {
  return (
    <article className="ad-card ad-card-hover min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025]">
            <Icon aria-hidden className="size-4 text-zinc-400" strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold text-zinc-100">{title}</h3>
            <p className="mt-1 truncate text-[10px] text-zinc-600">{source}</p>
          </div>
        </div>
        <StateBadge tone={tone}>{status}</StateBadge>
      </div>

      <p className="mt-4 min-h-10 text-xs leading-5 text-zinc-400">{recommendation}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="text-zinc-600">Confidence</span>
          <span className="font-mono text-zinc-300">{Math.round(confidence * 100)}%</span>
        </div>
        <ProgressMeter
          value={confidence * 100}
          tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "positive"}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Clock3 aria-hidden className="size-3" />
          {lastRun}
        </span>
        {synthetic ? (
          <span
            className="rounded border border-white/[0.07] px-2.5 py-1 text-[10px] font-semibold text-zinc-500"
            title="Deterministic local synthesis. This card does not make a separate OpenAI call."
          >
            Local synthesis
          </span>
        ) : (
          <button
            className="rounded border border-white/[0.09] px-2.5 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-emerald-400/30 hover:text-emerald-300 disabled:opacity-50"
            disabled={loading || !onRun}
            onClick={onRun}
            type="button"
          >
            {loading ? "Running" : "Run agent"}
          </button>
        )}
      </div>
    </article>
  );
}
