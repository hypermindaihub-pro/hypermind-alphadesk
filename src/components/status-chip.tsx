type StatusChipProps = {
  label: string;
  tone?: "green" | "amber" | "red" | "neutral";
};

const toneClassName = {
  green: "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300/90",
  amber: "border-amber-400/15 bg-amber-400/[0.05] text-amber-300/90",
  red: "border-rose-400/15 bg-rose-400/[0.05] text-rose-300/90",
  neutral: "border-white/[0.08] bg-white/[0.025] text-zinc-400",
};

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide ${toneClassName[tone]}`}
    >
      {label}
    </span>
  );
}
