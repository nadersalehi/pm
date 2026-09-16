import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { Card, Column } from "@/lib/kanban";
import { IconButton } from "@/components/IconButton";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => Promise<void>;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onRenameCommit,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [isAdding, setIsAdding] = useState(false);

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[360px] snap-start flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[0_4px_12px_rgba(3,33,71,0.06)] transition lg:min-h-0",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <header className="flex items-center gap-1.5 border-b border-[var(--stroke)] px-3 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-yellow)]" />
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={(event) => onRenameCommit(column.id, event.target.value)}
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
      </header>
      <div className="flex flex-1 flex-col gap-2 p-3 lg:overflow-y-auto">
        {isAdding && (
          <NewCardForm
            onAdd={(title, details) => onAddCard(column.id, title, details)}
            onClose={() => setIsAdding(false)}
          />
        )}
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && !isAdding && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
    </section>
  );
};
