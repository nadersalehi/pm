import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative cursor-grab rounded-2xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_6px_16px_rgba(3,33,71,0.06)]",
        "transition-shadow duration-150 hover:shadow-[0_10px_22px_rgba(3,33,71,0.1)] active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <h4 className="break-words pr-7 font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
        {card.title}
      </h4>
      {card.details && (
        <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
          {card.details}
        </p>
      )}
      <IconButton
        label={`Delete ${card.title}`}
        icon={Trash2}
        onClick={() => onDelete(card.id)}
        className="absolute right-2 top-2 h-7 w-7 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
      />
    </article>
  );
};
