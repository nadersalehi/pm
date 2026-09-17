import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import * as api from "@/lib/api";
import { buildBoard } from "@/test/fixtures";

vi.mock("@/lib/api");

const mockedApi = vi.mocked(api);

const summaries = [
  { id: "board-1", name: "Roadmap", description: "", cardCount: 2 },
  { id: "board-2", name: "Hiring", description: "", cardCount: 0 },
];

beforeEach(() => {
  localStorage.clear();
  const boards = new Map(summaries.map((board) => [board.id, buildBoard(board)]));
  mockedApi.fetchBoards.mockResolvedValue(summaries);
  mockedApi.fetchBoard.mockImplementation(async (boardId) => boards.get(boardId)!);
  mockedApi.createBoard.mockImplementation(async (name, description) => {
    const board = buildBoard({ id: "board-3", name, description });
    boards.set(board.id, board);
    return board;
  });
  mockedApi.deleteBoard.mockResolvedValue(undefined);
});

const renderWorkspace = () => {
  const props = { onLogout: vi.fn(), onAccountDeleted: vi.fn() };
  render(<Workspace user={{ username: "ada" }} {...props} />);
  return props;
};

const switcher = () => screen.getByRole("button", { name: "Switch board" });

describe("Workspace", () => {
  it("opens the first board by default", async () => {
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(switcher()).toHaveTextContent("Roadmap");
    expect(mockedApi.fetchBoard).toHaveBeenCalledWith("board-1");
  });

  it("switches boards from the switcher and remembers the choice", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });

    await userEvent.click(switcher());
    const menu = screen.getByRole("menu", { name: "Boards" });
    expect(within(menu).getByRole("menuitemradio", { name: /roadmap/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /hiring/i }));

    expect(await screen.findByRole("heading", { name: "Hiring" })).toBeInTheDocument();
    expect(localStorage.getItem("kanban-studio:last-board:ada")).toBe("board-2");
  });

  it("reopens the remembered board", async () => {
    localStorage.setItem("kanban-studio:last-board:ada", "board-2");
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Hiring" })).toBeInTheDocument();
  });

  it("ignores a remembered board that no longer exists", async () => {
    localStorage.setItem("kanban-studio:last-board:ada", "board-99");
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
  });

  it("creates a board and opens it", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(switcher());
    await userEvent.click(screen.getByRole("menuitem", { name: /new board/i }));

    const dialog = screen.getByRole("dialog", { name: "New board" });
    await userEvent.type(within(dialog).getByLabelText("Board name"), "Launch");
    await userEvent.type(within(dialog).getByLabelText("Description"), "Q4");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(mockedApi.createBoard).toHaveBeenCalledWith("Launch", "Q4");
    expect(switcher()).toHaveTextContent("Launch");
  });

  it("requires a board name", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(switcher());
    await userEvent.click(screen.getByRole("menuitem", { name: /new board/i }));
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/name is required/i);
    expect(mockedApi.createBoard).not.toHaveBeenCalled();
  });

  it("falls back to another board after deleting the open one", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: "Board settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Delete board" })).getByRole("button", {
        name: "Delete board",
      })
    );
    expect(await screen.findByRole("heading", { name: "Hiring" })).toBeInTheDocument();
  });

  it("offers to create a board when there are none", async () => {
    mockedApi.fetchBoards.mockResolvedValue([]);
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: /no boards yet/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch board" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /create a board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "First");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByRole("heading", { name: "First" })).toBeInTheDocument();
  });

  it("shows a retry when boards fail to load", async () => {
    mockedApi.fetchBoards.mockRejectedValueOnce(new Error("offline"));
    renderWorkspace();
    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
  });

  it("refreshes board card counts when the switcher opens", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    mockedApi.fetchBoards.mockResolvedValue([{ ...summaries[0], cardCount: 5 }, summaries[1]]);
    await userEvent.click(switcher());
    expect(await screen.findByText("5 cards")).toBeInTheDocument();
  });

  it("logs out and opens account settings", async () => {
    const { onLogout } = renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: "Account settings" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toHaveTextContent("Signed in as ada");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("toggles the assistant panel", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: "Hide AI assistant" }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Chat message" })).not.toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    expect(screen.getByRole("textbox", { name: "Chat message" })).toBeInTheDocument();
  });
});
