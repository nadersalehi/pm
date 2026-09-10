import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import * as api from "@/lib/api";

vi.mock("@/lib/api");

const mockedApi = vi.mocked(api);

const buildBoard = () => ({
  columns: [{ id: "col-1", title: "Backlog", cardIds: [] }],
  cards: {},
});

const sendMessage = async (text: string) => {
  await userEvent.type(screen.getByLabelText("Chat message"), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

describe("ChatSidebar", () => {
  it("sends a message and displays the reply", async () => {
    mockedApi.sendChatMessage.mockResolvedValue({
      reply: "Added it.",
      board: buildBoard(),
    });
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await sendMessage("add a card to Backlog");

    expect(await screen.findByText("add a card to Backlog")).toBeInTheDocument();
    expect(await screen.findByText("Added it.")).toBeInTheDocument();
    expect(mockedApi.sendChatMessage).toHaveBeenCalledWith(
      "add a card to Backlog",
      []
    );
  });

  it("triggers a board update with the returned board", async () => {
    const board = buildBoard();
    mockedApi.sendChatMessage.mockResolvedValue({ reply: "Done.", board });
    const onBoardUpdate = vi.fn();
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);

    await sendMessage("hi");

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(board));
  });

  it("sends prior turns as history on the next message", async () => {
    mockedApi.sendChatMessage.mockResolvedValue({
      reply: "First reply.",
      board: buildBoard(),
    });
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await sendMessage("first");
    await screen.findByText("First reply.");

    mockedApi.sendChatMessage.mockResolvedValue({
      reply: "Second reply.",
      board: buildBoard(),
    });
    await sendMessage("second");

    await waitFor(() =>
      expect(mockedApi.sendChatMessage).toHaveBeenLastCalledWith("second", [
        { role: "user", content: "first" },
        { role: "assistant", content: "First reply." },
      ])
    );
  });

  it("shows a loading state while waiting on the reply", async () => {
    mockedApi.sendChatMessage.mockReturnValue(new Promise(() => {}));
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await sendMessage("hi");

    expect(await screen.findByText(/thinking/i)).toBeInTheDocument();
  });

  it("shows an error state when the call fails", async () => {
    mockedApi.sendChatMessage.mockRejectedValueOnce(new Error("network error"));
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await sendMessage("hi");

    expect(
      await screen.findByText(/couldn't reach the assistant/i)
    ).toBeInTheDocument();
  });
});
