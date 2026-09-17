"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { BoardSummary } from "@/lib/kanban";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeBoardId: string | null;
  onOpen: () => void;
  onSelect: (boardId: string) => void;
  onCreate: () => void;
};

export const BoardSwitcher = ({
  boards,
  activeBoardId,
  onOpen,
  onSelect,
  onCreate,
}: BoardSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const active = boards.find((board) => board.id === activeBoardId);

  const close = (action: () => void) => {
    setIsOpen(false);
    action();
  };

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
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Switch board"
        onClick={() => {
          if (!isOpen) {
            onOpen();
          }
          setIsOpen(!isOpen);
        }}
        className="flex max-w-[16rem] items-center gap-2 rounded-full border border-[var(--stroke)] bg-white py-1.5 pl-4 pr-3 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
      >
        <span className="truncate">{active?.name ?? "Select a board"}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--gray-text)]" aria-hidden />
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label="Boards"
          className="absolute left-0 top-11 z-30 w-72 rounded-2xl border border-[var(--stroke)] bg-white p-1.5 shadow-[var(--shadow)]"
        >
          <div className="max-h-80 overflow-y-auto">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                role="menuitemradio"
                aria-checked={board.id === activeBoardId}
                onClick={() => close(() => onSelect(board.id))}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface)]",
                  board.id === activeBoardId && "bg-[var(--surface)]"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--navy-dark)]">
                    {board.name}
                  </span>
                  <span className="block text-xs text-[var(--gray-text)]">
                    {board.cardCount} {board.cardCount === 1 ? "card" : "cards"}
                  </span>
                </span>
                {board.id === activeBoardId && (
                  <Check className="h-4 w-4 text-[var(--primary-blue)]" aria-hidden />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => close(onCreate)}
            className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-[var(--stroke)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New board
          </button>
        </div>
      )}
    </div>
  );
};
