"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { LABEL_COLOR_CLASSES } from "@/components/LabelChip";
import { Modal, fieldClass, labelClass } from "@/components/Modal";
import type { CardInput } from "@/lib/api";
import { PRIORITIES, checklistProgress, type Card, type Label, type Priority } from "@/lib/kanban";

type CardDialogProps = {
  card: Card;
  labels: Label[];
  onSave: (patch: CardInput) => Promise<void>;
  onDelete: () => void;
  onAddItem: (text: string) => Promise<void>;
  onToggleItem: (itemId: string, done: boolean) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onClose: () => void;
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const CardDialog = ({
  card,
  labels,
  onSave,
  onDelete,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onClose,
}: CardDialogProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labelIds, setLabelIds] = useState(card.labelIds);
  const [newItem, setNewItem] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = checklistProgress(card);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        details: details.trim(),
        priority,
        dueDate: dueDate || null,
        labelIds,
      });
      onClose();
    } catch {
      setError("Couldn't save the card.");
      setIsSaving(false);
    }
  };

  const runChecklist = async (action: () => Promise<void>): Promise<boolean> => {
    setError(null);
    try {
      await action();
      return true;
    } catch {
      setError("Couldn't update the checklist.");
      return false;
    }
  };

  const handleAddItem = async () => {
    const text = newItem.trim();
    if (!text) {
      return;
    }
    // Clear right away so typing the next item while this one saves isn't wiped later.
    setNewItem("");
    if (!(await runChecklist(() => onAddItem(text)))) {
      setNewItem((current) => current || text);
    }
  };

  return (
    <Modal title="Edit card" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="card-title" className={labelClass}>
            Title
          </label>
          <input
            id="card-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            autoFocus
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="card-details" className={labelClass}>
            Details
          </label>
          <textarea
            id="card-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            className={`${fieldClass} resize-y`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="card-priority" className={labelClass}>
              Priority
            </label>
            <select
              id="card-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
              className={fieldClass}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="card-due" className={labelClass}>
              Due date
            </label>
            <input
              id="card-due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>Labels</legend>
          {labels.length === 0 ? (
            <p className="text-xs text-[var(--gray-text)]">
              This board has no labels yet. Create them from the labels button in the board
              toolbar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => {
                const selected = labelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setLabelIds((ids) =>
                        selected ? ids.filter((id) => id !== label.id) : [...ids, label.id]
                      )
                    }
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold transition",
                      LABEL_COLOR_CLASSES[label.color],
                      selected
                        ? "ring-2 ring-[var(--navy-dark)] ring-offset-1"
                        : "opacity-50 hover:opacity-100"
                    )}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <section aria-label="Checklist">
          <div className={clsx(labelClass, "flex items-center justify-between")}>
            <span>Checklist</span>
            {progress.total > 0 && (
              <span>
                {progress.done}/{progress.total}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
              <div
                className="h-full rounded-full bg-[var(--primary-blue)] transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          )}
          <ul className="space-y-1">
            {card.checklist.map((item) => (
              <li key={item.id} className="group flex items-center gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[var(--surface)]">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => runChecklist(() => onToggleItem(item.id, !item.done))}
                  />
                  <span
                    className={clsx(
                      "break-words",
                      item.done
                        ? "text-[var(--gray-text)] line-through"
                        : "text-[var(--navy-dark)]"
                    )}
                  >
                    {item.text}
                  </span>
                </label>
                <IconButton
                  label={`Delete checklist item ${item.text}`}
                  icon={Trash2}
                  onClick={() => runChecklist(() => onDeleteItem(item.id))}
                  className="h-7 w-7 hover:text-red-600"
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <input
              aria-label="New checklist item"
              placeholder="Add an item"
              value={newItem}
              maxLength={300}
              onChange={(event) => setNewItem(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddItem();
                }
              }}
              className={fieldClass}
            />
            <IconButton
              label="Add checklist item"
              icon={Plus}
              onClick={handleAddItem}
              disabled={!newItem.trim()}
            />
          </div>
        </section>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete card
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
