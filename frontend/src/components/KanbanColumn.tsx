import { useRef, useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowLeft, ArrowRight, EllipsisVertical, Plus, Trash2 } from "lucide-react";
import type { CardInput } from "@/lib/api";
import type { Card, Column, Label } from "@/lib/kanban";
import { IconButton } from "@/components/IconButton";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  labels: Label[];
  today: string;
  isFiltered: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onMove: (columnId: string, direction: -1 | 1) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string, input: CardInput) => Promise<void>;
  onOpenCard: (cardId: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

const menuItemClass =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--navy-dark)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40";

export const KanbanColumn = ({
  column,
  cards,
  labels,
  today,
  isFiltered,
  canMoveLeft,
  canMoveRight,
  onRename,
  onRenameCommit,
  onMove,
  onDelete,
  onAddCard,
  onOpenCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: isFiltered });
  const [isAdding, setIsAdding] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const titleAtFocus = useRef(column.title);

  const runMenuAction = (action: () => void) => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[360px] snap-start flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[0_4px_12px_rgba(3,33,71,0.06)] transition lg:min-h-0",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <header className="flex items-center gap-1 border-b border-[var(--stroke)] py-2.5 pl-3 pr-1.5">
        <input
          value={column.title}
          onFocus={() => {
            titleAtFocus.current = column.title;
          }}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={() => {
            const title = column.title.trim();
            if (!title) {
              onRename(column.id, titleAtFocus.current);
            } else if (title !== titleAtFocus.current) {
              onRenameCommit(column.id, title);
            }
          }}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          maxLength={200}
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 font-display text-[15px] font-semibold text-[var(--navy-dark)] outline-none focus:bg-[var(--surface)]"
          aria-label="Column title"
        />
        <span
          className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-xs font-semibold text-[var(--gray-text)]"
          title={`${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
        >
          {cards.length}
        </span>
        <IconButton
          label="Add a card"
          icon={Plus}
          onClick={() => setIsAdding(true)}
          pressed={isAdding}
          className="h-7 w-7 hover:text-[var(--primary-blue)]"
        />
        <div
          className="relative"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsMenuOpen(false);
            }
          }}
          onKeyDown={(event) => event.key === "Escape" && setIsMenuOpen(false)}
        >
          <IconButton
            label="Column actions"
            icon={EllipsisVertical}
            onClick={() => setIsMenuOpen((open) => !open)}
            pressed={isMenuOpen}
            className="h-7 w-6"
          />
          {isMenuOpen && (
            <div
              role="menu"
              aria-label={`${column.title} actions`}
              className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-[var(--stroke)] bg-white p-1 shadow-[var(--shadow)]"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!canMoveLeft}
                onClick={() => runMenuAction(() => onMove(column.id, -1))}
                className={menuItemClass}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> Move left
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canMoveRight}
                onClick={() => runMenuAction(() => onMove(column.id, 1))}
                className={menuItemClass}
              >
                <ArrowRight className="h-4 w-4" aria-hidden /> Move right
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(() => onDelete(column.id))}
                className={clsx(menuItemClass, "text-red-600")}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete column
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-3 lg:overflow-y-auto">
        {isAdding && (
          <NewCardForm
            onAdd={(input) => onAddCard(column.id, input)}
            onClose={() => setIsAdding(false)}
          />
        )}
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              today={today}
              labels={labels}
              dragDisabled={isFiltered}
              onOpen={onOpenCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && !isAdding && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {isFiltered ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
    </section>
  );
};
