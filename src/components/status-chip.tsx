type StatusChipProps = {
  label: string;
  tone?: "green" | "amber" | "red" | "neutral";
};

const toneClassName = {
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  red: "border-red-400/35 bg-red-400/10 text-red-200",
  neutral: "border-white/12 bg-white/6 text-zinc-200",
};

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneClassName[tone]}`}
    >
      {label}
    </span>
  );
}
