type StatusChipProps = {
  label: string;
  tone?: "green" | "amber" | "red" | "neutral";
};

const toneClassName = {
  green: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300",
  amber: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300",
  red: "border-red-400/25 bg-red-400/[0.08] text-red-300",
  neutral: "border-white/[0.09] bg-white/[0.025] text-zinc-400",
};

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-2 text-[10px] font-semibold uppercase ${toneClassName[tone]}`}
    >
      {label}
    </span>
  );
}
