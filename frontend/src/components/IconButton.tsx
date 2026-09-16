import clsx from "clsx";
import type { ComponentType, MouseEventHandler } from "react";

type IconButtonProps = {
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  variant?: "ghost" | "primary";
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
};

export const IconButton = ({
  label,
  icon: Icon,
  onClick,
  type = "button",
  variant = "ghost",
  disabled,
  pressed,
  className,
}: IconButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={pressed}
    title={label}
    className={clsx(
      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-blue)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      variant === "primary"
        ? "bg-[var(--secondary-purple)] text-white hover:brightness-110"
        : "text-[var(--gray-text)] hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]",
      className
    )}
  >
    <Icon className="h-4 w-4" aria-hidden />
  </button>
);
