import {
  EMPTY_FILTER,
  activeFilterCount,
  addDays,
  cardMatches,
  cardPassesFilter,
  checklistProgress,
  dueStatus,
  moveCard,
  toIsoDate,
  type Column,
} from "@/lib/kanban";
import { buildCard } from "@/test/fixtures";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("dueStatus", () => {
  it("is null without a due date", () => {
    expect(dueStatus(null, "2026-09-16")).toBeNull();
  });

  it("classifies past, present and future dates", () => {
    expect(dueStatus("2026-09-15", "2026-09-16")).toBe("overdue");
    expect(dueStatus("2026-09-16", "2026-09-16")).toBe("today");
    expect(dueStatus("2026-10-01", "2026-09-16")).toBe("upcoming");
  });
});

describe("toIsoDate", () => {
  it("formats a local date with zero padding", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("cardMatches", () => {
  const card = buildCard({ id: "card-1", title: "Ship Launch Page", details: "Final copy" });

  it("matches everything for a blank query", () => {
    expect(cardMatches(card, "   ")).toBe(true);
  });

  it("matches title or details case-insensitively", () => {
    expect(cardMatches(card, "launch")).toBe(true);
    expect(cardMatches(card, "FINAL")).toBe(true);
    expect(cardMatches(card, "roadmap")).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("cardPassesFilter", () => {
  const today = "2026-09-16";
  const card = buildCard({ id: "c", priority: "high", labelIds: ["label-1"], dueDate: "2026-09-20" });

  it("passes everything with the empty filter", () => {
    expect(cardPassesFilter(card, EMPTY_FILTER, today)).toBe(true);
  });

  it("matches any selected priority", () => {
    expect(cardPassesFilter(card, { ...EMPTY_FILTER, priorities: ["low", "high"] }, today)).toBe(true);
    expect(cardPassesFilter(card, { ...EMPTY_FILTER, priorities: ["low"] }, today)).toBe(false);
  });

  it("matches any selected label", () => {
    expect(cardPassesFilter(card, { ...EMPTY_FILTER, labelIds: ["label-2", "label-1"] }, today)).toBe(true);
    expect(cardPassesFilter(card, { ...EMPTY_FILTER, labelIds: ["label-2"] }, today)).toBe(false);
  });

  it("filters by due window", () => {
    const due = (dueDate: string | null, filterDue: "overdue" | "week" | "none") =>
      cardPassesFilter({ ...card, dueDate }, { ...EMPTY_FILTER, due: filterDue }, today);
    expect(due("2026-09-15", "overdue")).toBe(true);
    expect(due("2026-09-16", "overdue")).toBe(false);
    expect(due("2026-09-16", "week")).toBe(true);
    expect(due("2026-09-23", "week")).toBe(true);
    expect(due("2026-09-24", "week")).toBe(false);
    expect(due(null, "week")).toBe(false);
    expect(due(null, "none")).toBe(true);
    expect(due("2026-09-20", "none")).toBe(false);
  });

  it("requires every active criterion", () => {
    const filter = { priorities: ["high" as const], labelIds: ["label-2"], due: "any" as const };
    expect(cardPassesFilter(card, filter, today)).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("counts each selected option", () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ priorities: ["high", "low"], labelIds: ["label-1"], due: "overdue" })).toBe(4);
  });
});

describe("checklistProgress", () => {
  it("counts completed items", () => {
    const card = buildCard({
      id: "c",
      checklist: [
        { id: "i1", text: "a", done: true },
        { id: "i2", text: "b", done: false },
      ],
    });
    expect(checklistProgress(card)).toEqual({ done: 1, total: 2 });
  });
});
