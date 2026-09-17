"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/IconButton";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export const Modal = ({ title, onClose, children }: ModalProps) => {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(3,33,71,0.35)] p-4 pt-[10vh]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
        className="w-full max-w-md rounded-3xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)]"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2
            id={titleId}
            className="font-display text-lg font-semibold text-[var(--navy-dark)]"
          >
            {title}
          </h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
};

export const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) => (
  <Modal title={title} onClose={onClose}>
    <p className="text-sm leading-6 text-[var(--gray-text)]">{message}</p>
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        autoFocus
        className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);
