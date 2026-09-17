"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { LABEL_COLOR_CLASSES } from "@/components/LabelChip";
import { Modal, fieldClass } from "@/components/Modal";
import { ApiError } from "@/lib/api";
import { LABEL_COLORS, type Label, type LabelColor } from "@/lib/kanban";

type LabelsDialogProps = {
  labels: Label[];
  onCreate: (name: string, color: LabelColor) => Promise<void>;
  onUpdate: (labelId: string, patch: { name?: string; color?: LabelColor }) => Promise<void>;
  onDelete: (labelId: string) => Promise<void>;
  onClose: () => void;
};

const describe = (error: unknown) =>
  error instanceof ApiError && error.status === 409
    ? "A label with that name already exists."
    : "Couldn't save the label.";

const baseField = fieldClass.replace("w-full ", "");
const inputClass = `${baseField} min-w-0 flex-1`;
const selectClass = `${baseField} w-28 shrink-0 capitalize`;

const Swatch = ({ color }: { color: LabelColor }) => (
  <span
    aria-hidden
    className={`h-4 w-4 shrink-0 rounded-full border border-[var(--stroke)] ${LABEL_COLOR_CLASSES[color]}`}
  />
);

export const LabelsDialog = ({ labels, onCreate, onUpdate, onDelete, onClose }: LabelsDialogProps) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(describe(caught));
    }
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    run(async () => {
      await onCreate(name.trim(), color);
      setName("");
    });
  };

  return (
    <Modal title="Labels" onClose={onClose}>
      {labels.length === 0 ? (
        <p className="text-sm text-[var(--gray-text)]">No labels yet.</p>
      ) : (
        <ul className="space-y-2">
          {labels.map((label) => (
            <li key={label.id} className="flex items-center gap-2">
              <Swatch color={label.color} />
              <input
                aria-label={`Name for ${label.name}`}
                defaultValue={label.name}
                maxLength={40}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== label.name) {
                    run(() => onUpdate(label.id, { name: next }));
                  } else {
                    event.target.value = label.name;
                  }
                }}
                className={inputClass}
              />
              <select
                aria-label={`Color for ${label.name}`}
                value={label.color}
                onChange={(event) =>
                  run(() => onUpdate(label.id, { color: event.target.value as LabelColor }))
                }
                className={selectClass}
              >
                {LABEL_COLORS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <IconButton
                label={`Delete label ${label.name}`}
                icon={Trash2}
                onClick={() => run(() => onDelete(label.id))}
                className="hover:text-red-600"
              />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="mt-4 flex items-center gap-2 border-t border-[var(--stroke)] pt-4">
        <Swatch color={color} />
        <input
          aria-label="New label name"
          placeholder="New label"
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
        <select
          aria-label="New label color"
          value={color}
          onChange={(event) => setColor(event.target.value as LabelColor)}
          className={selectClass}
        >
          {LABEL_COLORS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <IconButton label="Add label" icon={Plus} type="submit" variant="primary" disabled={!name.trim()} />
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
};
