import { CardBody } from "@/components/KanbanCard";
import type { Card, Label } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
  today: string;
  labels: Label[];
};

export const KanbanCardPreview = ({ card, today, labels }: KanbanCardPreviewProps) => (
  <article className="rotate-1 cursor-grabbing rounded-2xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.18)]">
    <CardBody card={card} today={today} labels={labels} />
  </article>
);
