import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import { toIsoDate } from "@/lib/kanban";
import { buildBoard, buildCard, buildLabeledBoard } from "@/test/fixtures";

vi.mock("@/lib/api");

const mockedApi = vi.mocked(api);

beforeEach(() => {
  mockedApi.fetchBoard.mockResolvedValue(buildBoard());
  mockedApi.renameColumn.mockResolvedValue(undefined);
  mockedApi.addCard.mockResolvedValue(
    buildCard({ id: "card-3", title: "New card", details: "Notes" })
  );
  mockedApi.updateCard.mockImplementation(async (cardId, patch) =>
    buildCard({ id: cardId, title: "", ...patch })
  );
  mockedApi.deleteCard.mockResolvedValue(undefined);
  mockedApi.moveCard.mockResolvedValue(undefined);
  mockedApi.addColumn.mockResolvedValue({ id: "col-9", title: "Blocked", cardIds: [] });
  mockedApi.deleteColumn.mockResolvedValue(undefined);
  mockedApi.moveColumn.mockResolvedValue(undefined);
  mockedApi.updateBoard.mockImplementation(async (_, patch) => buildBoard(patch));
  mockedApi.deleteBoard.mockResolvedValue(undefined);
  mockedApi.sendChatMessage.mockResolvedValue({ reply: "Sure thing.", board: buildBoard() });
});

type Props = Parameters<typeof KanbanBoard>[0];

const boardElement = (props: Partial<Props> = {}) => (
  <KanbanBoard
    boardId="board-1"
    isChatOpen
    onBoardRenamed={vi.fn()}
    onBoardDeleted={vi.fn()}
    {...props}
  />
);

const renderBoard = async (props: Partial<Props> = {}) => {
  const handlers = { onBoardRenamed: vi.fn(), onBoardDeleted: vi.fn() };
  const result = render(boardElement({ ...handlers, ...props }));
  await screen.findAllByTestId(/^column-/);
  return { ...handlers, ...result };
};

const column = (index: number) => screen.getAllByTestId(/^column-/)[index];
const columnTitles = () =>
  screen.getAllByLabelText("Column title").map((input) => (input as HTMLInputElement).value);

describe("KanbanBoard", () => {
  it("shows a loading state before the board arrives", () => {
    mockedApi.fetchBoard.mockReturnValue(new Promise(() => {}));
    render(boardElement());
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
  });

  it("shows an error state and retries", async () => {
    mockedApi.fetchBoard.mockRejectedValueOnce(new Error("network error"));
    render(boardElement());
    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(2);
    expect(mockedApi.fetchBoard).toHaveBeenCalledTimes(2);
  });

  it("renders the board name, counts and columns for the given board", async () => {
    await renderBoard();
    expect(mockedApi.fetchBoard).toHaveBeenCalledWith("board-1");
    expect(screen.getByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(screen.getByText(/2 columns · 2 cards/)).toBeInTheDocument();
    expect(columnTitles()).toEqual(["Backlog", "Discovery"]);
  });

  it("renames a column locally and persists only a real change on blur", async () => {
    await renderBoard();
    const input = within(column(0)).getByLabelText("Column title");

    await userEvent.click(input);
    await userEvent.tab();
    expect(mockedApi.renameColumn).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    await userEvent.tab();
    await waitFor(() =>
      expect(mockedApi.renameColumn).toHaveBeenCalledWith("col-1", "New Name")
    );
  });

  it("restores the previous title when a column title is cleared", async () => {
    await renderBoard();
    const input = within(column(0)).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveValue("Backlog");
    expect(mockedApi.renameColumn).not.toHaveBeenCalled();
  });

  it("adds and removes a card", async () => {
    await renderBoard();
    await userEvent.click(within(column(0)).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column(0)).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column(0)).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column(0)).getByRole("button", { name: /add card/i }));

    expect(await within(column(0)).findByText("New card")).toBeInTheDocument();
    expect(mockedApi.addCard).toHaveBeenCalledWith("col-1", {
      title: "New card",
      details: "Notes",
      priority: "none",
      dueDate: null,
      labelIds: [],
    });

    await userEvent.click(within(column(0)).getByRole("button", { name: /delete new card/i }));
    await waitFor(() =>
      expect(within(column(0)).queryByText("New card")).not.toBeInTheDocument()
    );
    expect(mockedApi.deleteCard).toHaveBeenCalledWith("card-3");
  });

  it("keeps the typed card if adding fails", async () => {
    mockedApi.addCard.mockRejectedValueOnce(new Error("failed"));
    await renderBoard();
    await userEvent.click(within(column(0)).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column(0)).getByPlaceholderText(/card title/i), "Will fail");
    await userEvent.click(within(column(0)).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText(/couldn't add the card/i)).toBeInTheDocument();
    expect(within(column(0)).getByPlaceholderText(/card title/i)).toHaveValue("Will fail");
  });

  it("edits a card's details, priority and due date in the card dialog", async () => {
    await renderBoard();
    await userEvent.click(screen.getByText("Align roadmap themes"));

    const dialog = screen.getByRole("dialog", { name: "Edit card" });
    const title = within(dialog).getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed card");
    await userEvent.selectOptions(within(dialog).getByLabelText("Priority"), "high");
    await userEvent.type(within(dialog).getByLabelText("Due date"), "2026-10-01");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockedApi.updateCard).toHaveBeenCalledWith("card-1", {
      title: "Renamed card",
      details: "Draft quarterly themes.",
      priority: "high",
      dueDate: "2026-10-01",
      labelIds: [],
    });
    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByText("Renamed card")).toBeInTheDocument();
    expect(within(card).getByTestId("priority-badge")).toHaveTextContent("high");
    expect(within(card).getByTestId("due-badge")).toHaveTextContent("2026-10-01");
  });

  it("keeps the card dialog open with an error when saving fails", async () => {
    mockedApi.updateCard.mockRejectedValueOnce(new Error("nope"));
    await renderBoard();
    await userEvent.click(screen.getByText("Align roadmap themes"));
    const dialog = screen.getByRole("dialog", { name: "Edit card" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/couldn't save/i);
  });

  it("requires a title in the card dialog", async () => {
    await renderBoard();
    await userEvent.click(screen.getByText("Align roadmap themes"));
    const dialog = screen.getByRole("dialog", { name: "Edit card" });
    await userEvent.clear(within(dialog).getByLabelText("Title"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/title is required/i);
    expect(mockedApi.updateCard).not.toHaveBeenCalled();
  });

  it("closes the card dialog with Escape without saving", async () => {
    await renderBoard();
    await userEvent.click(screen.getByText("Align roadmap themes"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedApi.updateCard).not.toHaveBeenCalled();
  });

  it("deletes a card from its dialog", async () => {
    await renderBoard();
    await userEvent.click(screen.getByText("Gather customer signals"));
    await userEvent.click(screen.getByRole("button", { name: "Delete card" }));
    await waitFor(() =>
      expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument()
    );
    expect(mockedApi.deleteCard).toHaveBeenCalledWith("card-2");
  });

  it("marks overdue and today's due dates", async () => {
    const today = toIsoDate(new Date());
    mockedApi.fetchBoard.mockResolvedValue(
      buildBoard({
        columns: [{ id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] }],
        cards: {
          "card-1": buildCard({ id: "card-1", dueDate: "2000-01-01" }),
          "card-2": buildCard({ id: "card-2", dueDate: today }),
        },
      })
    );
    await renderBoard();
    const badges = screen.getAllByTestId("due-badge");
    expect(badges.map((badge) => badge.dataset.status)).toEqual(["overdue", "today"]);
    expect(badges[1]).toHaveTextContent("Today");
  });

  it("filters cards by search text", async () => {
    await renderBoard();
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "signals");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
    expect(within(column(1)).getByText(/no matching cards/i)).toBeInTheDocument();
  });

  it("adds a column", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await userEvent.type(screen.getByLabelText("Column name"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(columnTitles()).toEqual(["Backlog", "Discovery", "Blocked"]));
    expect(mockedApi.addColumn).toHaveBeenCalledWith("board-1", "Blocked");
  });

  it("moves a column right from its actions menu", async () => {
    await renderBoard();
    await userEvent.click(within(column(0)).getByRole("button", { name: "Column actions" }));
    expect(screen.getByRole("menuitem", { name: /move left/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("menuitem", { name: /move right/i }));
    expect(columnTitles()).toEqual(["Discovery", "Backlog"]);
    expect(mockedApi.moveColumn).toHaveBeenCalledWith("col-1", 1);
  });

  it("deletes a column only after confirmation", async () => {
    await renderBoard();
    await userEvent.click(within(column(0)).getByRole("button", { name: "Column actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /delete column/i }));

    const confirm = screen.getByRole("dialog", { name: "Delete column" });
    expect(confirm).toHaveTextContent('Delete "Backlog" and its 2 cards?');
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(mockedApi.deleteColumn).not.toHaveBeenCalled();

    await userEvent.click(within(column(0)).getByRole("button", { name: "Column actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /delete column/i }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Delete column" })).getByRole("button", {
        name: "Delete column",
      })
    );
    await waitFor(() => expect(columnTitles()).toEqual(["Discovery"]));
    expect(mockedApi.deleteColumn).toHaveBeenCalledWith("col-1");
    expect(screen.getByText(/1 column · 0 cards/)).toBeInTheDocument();
  });

  it("renames the board from board settings and reports it", async () => {
    const { onBoardRenamed } = await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Board settings" }));
    const name = screen.getByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.type(name, "Launch");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(mockedApi.updateBoard).toHaveBeenCalledWith("board-1", {
      name: "Launch",
      description: "",
    });
    expect(onBoardRenamed).toHaveBeenCalledWith({ id: "board-1", name: "Launch", description: "" });
  });

  it("deletes the board after confirmation and reports it", async () => {
    const { onBoardDeleted } = await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Board settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Delete board" })).getByRole("button", {
        name: "Delete board",
      })
    );
    await waitFor(() => expect(onBoardDeleted).toHaveBeenCalledWith("board-1"));
    expect(mockedApi.deleteBoard).toHaveBeenCalledWith("board-1");
  });

  it("shows an error and resyncs when saving a column name fails", async () => {
    mockedApi.renameColumn.mockRejectedValueOnce(new Error("nope"));
    await renderBoard();
    const input = within(column(0)).getByLabelText("Column title");
    await userEvent.type(input, "!");
    await userEvent.tab();
    expect(await screen.findByText(/couldn't save the column name/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedApi.fetchBoard).toHaveBeenCalledTimes(2));
  });

  it("updates the board from an AI chat reply without a reload", async () => {
    mockedApi.sendChatMessage.mockResolvedValue({
      reply: "Added a card to Discovery.",
      board: buildBoard({
        columns: [
          { id: "col-1", title: "Backlog", cardIds: [] },
          { id: "col-2", title: "Discovery", cardIds: ["card-9"] },
        ],
        cards: { "card-9": buildCard({ id: "card-9", title: "AI added card" }) },
      }),
    });
    await renderBoard();

    await userEvent.type(screen.getByLabelText("Chat message"), "add a card to Discovery");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("AI added card")).toBeInTheDocument();
    expect(mockedApi.sendChatMessage).toHaveBeenCalledWith(
      "board-1",
      "add a card to Discovery",
      []
    );
  });

  it("hides the assistant without unmounting it", async () => {
    const { rerender } = await renderBoard();
    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Sure thing.")).toBeInTheDocument();

    rerender(boardElement({ isChatOpen: false }));
    expect(screen.queryByRole("textbox", { name: "Chat message" })).not.toBeInTheDocument();

    rerender(boardElement());
    expect(screen.getByText("Sure thing.")).toBeInTheDocument();
  });

  describe("labels, checklists and filters", () => {
    beforeEach(() => {
      mockedApi.fetchBoard.mockResolvedValue(buildLabeledBoard());
      mockedApi.createLabel.mockImplementation(async (_, name, color) => ({
        id: "label-9",
        name,
        color,
      }));
      mockedApi.updateLabel.mockImplementation(async (labelId, patch) => ({
        id: labelId,
        name: "Bug",
        color: "navy",
        ...patch,
      }));
      mockedApi.deleteLabel.mockResolvedValue(undefined);
      mockedApi.addChecklistItem.mockImplementation(async (_, text) => ({
        id: "item-9",
        text,
        done: false,
      }));
      mockedApi.updateChecklistItem.mockImplementation(async (itemId, patch) => ({
        id: itemId,
        text: "Write spec",
        done: false,
        ...patch,
      }));
      mockedApi.deleteChecklistItem.mockResolvedValue(undefined);
    });

    const card1 = () => screen.getByTestId("card-card-1");

    it("shows labels and checklist progress on the card face", async () => {
      await renderBoard();
      expect(within(card1()).getByText("Bug")).toBeInTheDocument();
      expect(within(card1()).queryByText("Feature")).not.toBeInTheDocument();
      expect(within(card1()).getByTestId("checklist-progress")).toHaveTextContent("1/2");
    });

    it("toggles labels in the card dialog and saves them", async () => {
      await renderBoard();
      await userEvent.click(within(card1()).getByText("Align roadmap themes"));
      const dialog = screen.getByRole("dialog", { name: "Edit card" });
      const bug = within(dialog).getByRole("button", { name: "Bug" });
      const feature = within(dialog).getByRole("button", { name: "Feature" });
      expect(bug).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(bug);
      await userEvent.click(feature);
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(mockedApi.updateCard).toHaveBeenCalledWith(
          "card-1",
          expect.objectContaining({ labelIds: ["label-2"] })
        )
      );
    });

    it("adds, completes and deletes checklist items live", async () => {
      await renderBoard();
      await userEvent.click(within(card1()).getByText("Align roadmap themes"));
      const dialog = screen.getByRole("dialog", { name: "Edit card" });

      await userEvent.type(within(dialog).getByLabelText("New checklist item"), "Ship it{Enter}");
      expect(await within(dialog).findByText("Ship it")).toBeInTheDocument();
      expect(mockedApi.addChecklistItem).toHaveBeenCalledWith("card-1", "Ship it");
      expect(within(dialog).getByLabelText("New checklist item")).toHaveValue("");
      expect(within(card1()).getByTestId("checklist-progress")).toHaveTextContent("1/3");

      await userEvent.click(within(dialog).getByRole("checkbox", { name: "Write spec" }));
      expect(within(card1()).getByTestId("checklist-progress")).toHaveTextContent("2/3");
      expect(mockedApi.updateChecklistItem).toHaveBeenCalledWith("item-2", { done: true });

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete checklist item Ship it" })
      );
      await waitFor(() => expect(within(dialog).queryByText("Ship it")).not.toBeInTheDocument());
      expect(within(card1()).getByTestId("checklist-progress")).toHaveTextContent("2/2");
    });

    it("rolls back a checklist toggle that fails to save", async () => {
      let rejectSave: (error: Error) => void = () => {};
      mockedApi.updateChecklistItem.mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectSave = reject;
        })
      );
      await renderBoard();
      await userEvent.click(within(card1()).getByText("Align roadmap themes"));
      const dialog = screen.getByRole("dialog", { name: "Edit card" });
      const checkbox = within(dialog).getByRole("checkbox", { name: "Write spec" });

      await userEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      rejectSave(new Error("offline"));
      await waitFor(() => expect(checkbox).not.toBeChecked());
      expect(within(dialog).getByRole("alert")).toHaveTextContent(/checklist/);
      expect(within(card1()).getByTestId("checklist-progress")).toHaveTextContent("1/2");
    });

    it("keeps the next checklist item typed while the previous one saves", async () => {
      let finishFirst: () => void = () => {};
      mockedApi.addChecklistItem.mockImplementationOnce(
        (_, text) =>
          new Promise((resolve) => {
            finishFirst = () => resolve({ id: "item-8", text, done: false });
          })
      );
      await renderBoard();
      await userEvent.click(within(card1()).getByText("Align roadmap themes"));
      const dialog = screen.getByRole("dialog", { name: "Edit card" });
      const input = within(dialog).getByLabelText("New checklist item");

      await userEvent.type(input, "First{Enter}");
      await userEvent.type(input, "Second");
      finishFirst();
      expect(await within(dialog).findByText("First")).toBeInTheDocument();
      expect(input).toHaveValue("Second");
    });

    it("reports checklist failures inside the dialog", async () => {
      mockedApi.addChecklistItem.mockRejectedValueOnce(new Error("nope"));
      await renderBoard();
      await userEvent.click(within(card1()).getByText("Align roadmap themes"));
      const dialog = screen.getByRole("dialog", { name: "Edit card" });
      await userEvent.type(within(dialog).getByLabelText("New checklist item"), "Fails");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add checklist item" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(/checklist/);
      expect(within(dialog).getByLabelText("New checklist item")).toHaveValue("Fails");
    });

    it("creates, recolors, renames and deletes labels", async () => {
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Manage labels" }));
      const dialog = screen.getByRole("dialog", { name: "Labels" });

      await userEvent.type(within(dialog).getByLabelText("New label name"), "Urgent");
      await userEvent.selectOptions(within(dialog).getByLabelText("New label color"), "purple");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add label" }));
      expect(await within(dialog).findByLabelText("Name for Urgent")).toBeInTheDocument();
      expect(mockedApi.createLabel).toHaveBeenCalledWith("board-1", "Urgent", "purple");

      await userEvent.selectOptions(within(dialog).getByLabelText("Color for Bug"), "gray");
      expect(mockedApi.updateLabel).toHaveBeenCalledWith("label-1", { color: "gray" });

      const name = within(dialog).getByLabelText("Name for Feature");
      await userEvent.clear(name);
      await userEvent.type(name, "Enhancement");
      await userEvent.tab();
      await waitFor(() =>
        expect(mockedApi.updateLabel).toHaveBeenCalledWith("label-2", { name: "Enhancement" })
      );

      await userEvent.click(within(dialog).getByRole("button", { name: "Delete label Bug" }));
      await waitFor(() => expect(within(card1()).queryByText("Bug")).not.toBeInTheDocument());
      expect(mockedApi.deleteLabel).toHaveBeenCalledWith("label-1");
    });

    it("explains a duplicate label name", async () => {
      // vi.mock automocks ApiError, so its constructor doesn't assign status.
      mockedApi.createLabel.mockRejectedValueOnce(
        Object.assign(new api.ApiError(409, "exists"), { status: 409 })
      );
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Manage labels" }));
      const dialog = screen.getByRole("dialog", { name: "Labels" });
      await userEvent.type(within(dialog).getByLabelText("New label name"), "Bug");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add label" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already exists/);
    });

    it("filters by priority, label and due date and clears the filters", async () => {
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Filter cards" }));
      const filters = screen.getByRole("group", { name: "Card filters" });

      await userEvent.click(within(filters).getByRole("checkbox", { name: "High" }));
      expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
      expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Filter cards (1 active)" })).toBeInTheDocument();

      await userEvent.click(within(filters).getByRole("checkbox", { name: "High" }));
      await userEvent.click(within(filters).getByRole("checkbox", { name: "Feature" }));
      expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
      expect(screen.getByText("Gather customer signals")).toBeInTheDocument();

      await userEvent.click(within(filters).getByRole("radio", { name: "No due date" }));
      expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
      expect(within(column(0)).getByText(/no matching cards/i)).toBeInTheDocument();

      await userEvent.click(within(filters).getByRole("button", { name: "Clear filters" }));
      expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
      expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Filter cards" })).toBeInTheDocument();
    });

    it("opens a card from the keyboard with Enter", async () => {
      await renderBoard();
      card1().focus();
      await userEvent.keyboard("{Enter}");
      const dialog = screen.getByRole("dialog", { name: "Edit card" });
      expect(within(dialog).getByLabelText("Title")).toHaveFocus();
      expect(mockedApi.updateCard).not.toHaveBeenCalled();
    });
  });
});
