"use client";

import { useState } from "react";
import clsx from "clsx";
import { ListFilter } from "lucide-react";
import { PRIORITY_LABELS } from "@/components/CardDialog";
import { LabelChip } from "@/components/LabelChip";
import {
  EMPTY_FILTER,
  activeFilterCount,
  type CardFilter,
  type DueFilter,
  type Label,
  type Priority,
} from "@/lib/kanban";

type FilterMenuProps = {
  filter: CardFilter;
  labels: Label[];
  onChange: (filter: CardFilter) => void;
};

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due in the next 7 days" },
  { value: "none", label: "No due date" },
];

const toggle = <T,>(values: T[], value: T) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

const headingClass = "mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]";
const optionClass = "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--navy-dark)] hover:bg-[var(--surface)]";

export const FilterMenu = ({ filter, labels, onChange }: FilterMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const count = activeFilterCount(filter);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => event.key === "Escape" && setIsOpen(false)}
    >
      <button
        type="button"
        aria-label={count ? `Filter cards (${count} active)` : "Filter cards"}
        aria-expanded={isOpen}
        title="Filter cards"
        onClick={() => setIsOpen((open) => !open)}
        className={clsx(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white transition",
          count
            ? "border-[var(--primary-blue)] text-[var(--primary-blue)]"
            : "border-[var(--stroke)] text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
        )}
      >
        <ListFilter className="h-4 w-4" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary-blue)] px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>
      {isOpen && (
        <div
          role="group"
          aria-label="Card filters"
          className="absolute right-0 top-11 z-30 w-64 space-y-3 rounded-2xl border border-[var(--stroke)] bg-white p-3 shadow-[var(--shadow)]"
        >
          <fieldset>
            <legend className={headingClass}>Priority</legend>
            {(["high", "medium", "low", "none"] as Priority[]).map((priority) => (
              <label key={priority} className={optionClass}>
                <input
                  type="checkbox"
                  checked={filter.priorities.includes(priority)}
                  onChange={() =>
                    onChange({ ...filter, priorities: toggle(filter.priorities, priority) })
                  }
                />
                {PRIORITY_LABELS[priority]}
              </label>
            ))}
          </fieldset>
          {labels.length > 0 && (
            <fieldset>
              <legend className={headingClass}>Labels</legend>
              {labels.map((label) => (
                <label key={label.id} className={optionClass}>
                  <input
                    type="checkbox"
                    aria-label={label.name}
                    checked={filter.labelIds.includes(label.id)}
                    onChange={() =>
                      onChange({ ...filter, labelIds: toggle(filter.labelIds, label.id) })
                    }
                  />
                  <LabelChip name={label.name} color={label.color} />
                </label>
              ))}
            </fieldset>
          )}
          <fieldset>
            <legend className={headingClass}>Due date</legend>
            {DUE_OPTIONS.map((option) => (
              <label key={option.value} className={optionClass}>
                <input
                  type="radio"
                  name="due-filter"
                  checked={filter.due === option.value}
                  onChange={() => onChange({ ...filter, due: option.value })}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => onChange(EMPTY_FILTER)}
            className="w-full rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)] disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};
