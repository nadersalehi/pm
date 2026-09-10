import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";

vi.mock("@/lib/api");

const mockedApi = vi.mocked(api);

const buildBoard = () => ({
  columns: [
    { id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-2", title: "Discovery", cardIds: [] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags.",
    },
  },
});

beforeEach(() => {
  mockedApi.fetchBoard.mockResolvedValue(buildBoard());
  mockedApi.renameColumn.mockResolvedValue({ id: "col-1", title: "", cards: [] });
  mockedApi.addCard.mockResolvedValue({
    id: "card-3",
    title: "New card",
    details: "Notes",
  });
  mockedApi.deleteCard.mockResolvedValue(undefined);
  mockedApi.moveCard.mockResolvedValue({
    id: "card-1",
    title: "Align roadmap themes",
    details: "Draft quarterly themes.",
  });
  mockedApi.sendChatMessage.mockResolvedValue({
    reply: "Sure thing.",
    board: buildBoard(),
  });
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("shows a loading state before the board arrives", () => {
    mockedApi.fetchBoard.mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
  });

  it("shows an error state when the board fails to load", async () => {
    mockedApi.fetchBoard.mockRejectedValueOnce(new Error("network error"));
    render(<KanbanBoard onLogout={() => {}} />);
    expect(await screen.findByText(/couldn't load the board/i)).toBeInTheDocument();
  });

  it("renders columns from the API", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(2);
  });

  it("calls onLogout when the logout button is clicked", async () => {
    const onLogout = vi.fn();
    render(<KanbanBoard onLogout={onLogout} />);
    await screen.findAllByTestId(/column-/i);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("renames a column locally and persists on blur", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    await userEvent.tab();
    await waitFor(() =>
      expect(mockedApi.renameColumn).toHaveBeenCalledWith("col-1", "New Name")
    );
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(await within(column).findByText("New card")).toBeInTheDocument();
    expect(mockedApi.addCard).toHaveBeenCalledWith("col-1", "New card", "Notes");

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(within(column).queryByText("New card")).not.toBeInTheDocument()
    );
    expect(mockedApi.deleteCard).toHaveBeenCalledWith("card-3");
  });

  it("shows an error and keeps the card if adding fails", async () => {
    mockedApi.addCard.mockRejectedValueOnce(new Error("failed"));
    render(<KanbanBoard onLogout={() => {}} />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Will fail"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(await screen.findByText(/couldn't add the card/i)).toBeInTheDocument();
    expect(within(column).getByPlaceholderText(/card title/i)).toHaveValue(
      "Will fail"
    );
  });

  it("updates the board from an AI chat reply without a reload", async () => {
    mockedApi.sendChatMessage.mockResolvedValue({
      reply: "Added a card to Discovery.",
      board: {
        columns: [
          { id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] },
          { id: "col-2", title: "Discovery", cardIds: ["card-9"] },
        ],
        cards: {
          "card-1": {
            id: "card-1",
            title: "Align roadmap themes",
            details: "Draft quarterly themes.",
          },
          "card-2": {
            id: "card-2",
            title: "Gather customer signals",
            details: "Review support tags.",
          },
          "card-9": {
            id: "card-9",
            title: "AI added card",
            details: "",
          },
        },
      },
    });

    render(<KanbanBoard onLogout={() => {}} />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.type(
      screen.getByLabelText("Chat message"),
      "add a card to Discovery"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("AI added card")).toBeInTheDocument();
  });
});
