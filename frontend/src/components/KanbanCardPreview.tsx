import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rotate-1 cursor-grabbing rounded-2xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.18)]">
    <h4 className="break-words pr-7 font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details && (
      <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
        {card.details}
      </p>
    )}
  </article>
);
