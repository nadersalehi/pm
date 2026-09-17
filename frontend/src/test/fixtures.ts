import type { BoardData, Card } from "@/lib/kanban";

export const buildCard = (overrides: Partial<Card> & { id: string }): Card => ({
  title: overrides.id,
  details: "",
  priority: "none",
  dueDate: null,
  labelIds: [],
  checklist: [],
  ...overrides,
});

export const buildBoard = (overrides: Partial<BoardData> = {}): BoardData => ({
  id: "board-1",
  name: "Roadmap",
  description: "",
  labels: [],
  columns: [
    { id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-2", title: "Discovery", cardIds: [] },
  ],
  cards: {
    "card-1": buildCard({
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes.",
    }),
    "card-2": buildCard({
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags.",
    }),
  },
  ...overrides,
});

export const buildLabeledBoard = (): BoardData =>
  buildBoard({
    labels: [
      { id: "label-1", name: "Bug", color: "navy" },
      { id: "label-2", name: "Feature", color: "blue" },
    ],
    cards: {
      "card-1": buildCard({
        id: "card-1",
        title: "Align roadmap themes",
        priority: "high",
        labelIds: ["label-1"],
        checklist: [
          { id: "item-1", text: "Collect metrics", done: true },
          { id: "item-2", text: "Write spec", done: false },
        ],
      }),
      "card-2": buildCard({
        id: "card-2",
        title: "Gather customer signals",
        dueDate: "2030-01-01",
        labelIds: ["label-2"],
      }),
    },
  });
