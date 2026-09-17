"use client";

import { useState, type FormEvent } from "react";
import { Modal, fieldClass, labelClass } from "@/components/Modal";

type BoardDialogProps = {
  title: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
};

export const BoardDialog = ({
  title,
  submitLabel,
  initialName = "",
  initialDescription = "",
  onSubmit,
  onDelete,
  onClose,
}: BoardDialogProps) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Board name is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim(), description.trim());
      onClose();
    } catch {
      setError("Couldn't save the board.");
      setIsSaving(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="board-name" className={labelClass}>
            Board name
          </label>
          <input
            id="board-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            autoFocus
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="board-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="board-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className={`${fieldClass} resize-y`}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              Delete board
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};
