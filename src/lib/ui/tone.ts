// Canonical design tone scale for AlphaDesk.
//
// The app historically carried two parallel tone vocabularies: StatusChip used
// `green | amber | red | neutral` while trading-ui used
// `positive | warning | danger | neutral | info`. This module is the single
// source of truth. New UI should import `Tone` from here; the legacy chip tones
// map onto it through `chipToneToTone` so both stay visually consistent.

export type Tone = "positive" | "warning" | "danger" | "neutral" | "info";

export type ChipTone = "green" | "amber" | "red" | "neutral";

export const chipToneToTone: Record<ChipTone, Tone> = {
  green: "positive",
  amber: "warning",
  red: "danger",
  neutral: "neutral",
};

// Tailwind class fragments keyed by canonical tone. Kept as static string maps
// (not interpolated) so Tailwind's content scanner can see every class.
export const toneBadgeClass: Record<Tone, string> = {
  positive: "border-emerald-400/25 bg-emerald-400/8 text-emerald-300",
  warning: "border-amber-400/25 bg-amber-400/8 text-amber-300",
  danger: "border-red-400/25 bg-red-400/8 text-red-300",
  neutral: "border-white/10 bg-white/[0.025] text-zinc-300",
  info: "border-sky-400/25 bg-sky-400/8 text-sky-300",
};

export const toneDotClass: Record<Tone, string> = {
  positive: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
  neutral: "bg-zinc-500",
  info: "bg-sky-400",
};

export const toneTextClass: Record<Tone, string> = {
  positive: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-red-300",
  neutral: "text-zinc-100",
  info: "text-sky-300",
};

// Map a health/status string onto a canonical tone.
export function statusToTone(status: "pass" | "warn" | "fail" | string): Tone {
  if (status === "pass") {
    return "positive";
  }

  if (status === "fail") {
    return "danger";
  }

  if (status === "warn") {
    return "warning";
  }

  return "neutral";
}
