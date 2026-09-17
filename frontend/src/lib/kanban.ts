export const PRIORITIES = ["none", "low", "medium", "high"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const LABEL_COLORS = ["yellow", "blue", "purple", "navy", "gray"] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export type Label = {
  id: string;
  name: string;
  color: LabelColor;
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  dueDate: string | null;
  labelIds: string[];
  checklist: ChecklistItem[];
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  id: string;
  name: string;
  description: string;
  labels: Label[];
  columns: Column[];
  cards: Record<string, Card>;
};

export type BoardSummary = {
  id: string;
  name: string;
  description: string;
  cardCount: number;
};

export type DueStatus = "overdue" | "today" | "upcoming";

export const toIsoDate = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const dueStatus = (dueDate: string | null, today: string): DueStatus | null => {
  if (!dueDate) {
    return null;
  }
  if (dueDate < today) {
    return "overdue";
  }
  return dueDate === today ? "today" : "upcoming";
};

export const cardMatches = (card: Card, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return (
    !needle ||
    card.title.toLowerCase().includes(needle) ||
    card.details.toLowerCase().includes(needle)
  );
};

export type DueFilter = "any" | "overdue" | "week" | "none";

export type CardFilter = {
  priorities: Priority[];
  labelIds: string[];
  due: DueFilter;
};

export const EMPTY_FILTER: CardFilter = { priorities: [], labelIds: [], due: "any" };

export const activeFilterCount = (filter: CardFilter): number =>
  filter.priorities.length + filter.labelIds.length + (filter.due === "any" ? 0 : 1);

export const addDays = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return toIsoDate(new Date(year, month - 1, day + days));
};

export const cardPassesFilter = (card: Card, filter: CardFilter, today: string): boolean => {
  if (filter.priorities.length && !filter.priorities.includes(card.priority)) {
    return false;
  }
  if (filter.labelIds.length && !filter.labelIds.some((id) => card.labelIds.includes(id))) {
    return false;
  }
  switch (filter.due) {
    case "overdue":
      return dueStatus(card.dueDate, today) === "overdue";
    case "week":
      return card.dueDate !== null && card.dueDate >= today && card.dueDate <= addDays(today, 7);
    case "none":
      return card.dueDate === null;
    default:
      return true;
  }
};

export const checklistProgress = (card: Card) => ({
  done: card.checklist.filter((item) => item.done).length,
  total: card.checklist.length,
});

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};
