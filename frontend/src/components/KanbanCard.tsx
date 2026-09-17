import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CalendarDays, ListChecks, Trash2 } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { LabelChip } from "@/components/LabelChip";
import { checklistProgress, dueStatus, type Card, type Label } from "@/lib/kanban";

type CardBodyProps = {
  card: Card;
  today: string;
  labels: Label[];
};

type KanbanCardProps = CardBodyProps & {
  dragDisabled?: boolean;
  onOpen: (cardId: string) => void;
  onDelete: (cardId: string) => void;
};

export const CardBody = ({ card, today, labels }: CardBodyProps) => {
  const status = dueStatus(card.dueDate, today);
  const progress = checklistProgress(card);
  const cardLabels = labels.filter((label) => card.labelIds.includes(label.id));
  const hasMeta = card.priority !== "none" || status || progress.total > 0;
  return (
    <>
      {cardLabels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 pr-7">
          {cardLabels.map((label) => (
            <LabelChip key={label.id} name={label.name} color={label.color} />
          ))}
        </div>
      )}
      <h4 className="break-words pr-7 font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
        {card.title}
      </h4>
      {card.details && (
        <p className="mt-1 line-clamp-3 break-words text-xs leading-5 text-[var(--gray-text)]">
          {card.details}
        </p>
      )}
      {hasMeta && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.priority !== "none" && (
            <span
              data-testid="priority-badge"
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                card.priority === "high" && "bg-red-50 text-red-700",
                card.priority === "medium" &&
                  "bg-[color-mix(in_srgb,var(--accent-yellow)_30%,white)] text-[var(--navy-dark)]",
                card.priority === "low" &&
                  "bg-[color-mix(in_srgb,var(--primary-blue)_15%,white)] text-[var(--navy-dark)]"
              )}
            >
              {card.priority}
            </span>
          )}
          {status && card.dueDate && (
            <span
              data-testid="due-badge"
              data-status={status}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                status === "overdue" && "bg-red-600 text-white",
                status === "today" && "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
                status === "upcoming" && "bg-[var(--surface)] text-[var(--gray-text)]"
              )}
            >
              <CalendarDays className="h-3 w-3" aria-hidden />
              {status === "today" ? "Today" : card.dueDate}
            </span>
          )}
          {progress.total > 0 && (
            <span
              data-testid="checklist-progress"
              aria-label={`Checklist ${progress.done} of ${progress.total} done`}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                progress.done === progress.total
                  ? "bg-[color-mix(in_srgb,var(--primary-blue)_18%,white)] text-[var(--navy-dark)]"
                  : "bg-[var(--surface)] text-[var(--gray-text)]"
              )}
            >
              <ListChecks className="h-3 w-3" aria-hidden />
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
      )}
    </>
  );
};

export const KanbanCard = ({
  card,
  today,
  labels,
  dragDisabled,
  onOpen,
  onDelete,
}: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-2xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_6px_16px_rgba(3,33,71,0.06)]",
        "transition-shadow duration-150 hover:shadow-[0_10px_22px_rgba(3,33,71,0.1)]",
        dragDisabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (event.key === "Enter" && event.target === event.currentTarget) {
          // Otherwise the rest of this keystroke submits the dialog's newly focused form.
          event.preventDefault();
          onOpen(card.id);
        }
      }}
      data-testid={`card-${card.id}`}
    >
      <CardBody card={card} today={today} labels={labels} />
      <IconButton
        label={`Delete ${card.title}`}
        icon={Trash2}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(card.id);
        }}
        className="absolute right-2 top-2 h-7 w-7 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
      />
    </article>
  );
};
