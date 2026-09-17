import clsx from "clsx";
import type { LabelColor } from "@/lib/kanban";

export const LABEL_COLOR_CLASSES: Record<LabelColor, string> = {
  yellow: "bg-[color-mix(in_srgb,var(--accent-yellow)_30%,white)] text-[var(--navy-dark)]",
  blue: "bg-[color-mix(in_srgb,var(--primary-blue)_18%,white)] text-[var(--navy-dark)]",
  purple: "bg-[color-mix(in_srgb,var(--secondary-purple)_16%,white)] text-[var(--secondary-purple)]",
  navy: "bg-[var(--navy-dark)] text-white",
  gray: "bg-[color-mix(in_srgb,var(--gray-text)_18%,white)] text-[var(--navy-dark)]",
};

type LabelChipProps = {
  name: string;
  color: LabelColor;
  className?: string;
};

export const LabelChip = ({ name, color, className }: LabelChipProps) => (
  <span
    className={clsx(
      "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
      LABEL_COLOR_CLASSES[color],
      className
    )}
  >
    {name}
  </span>
);
