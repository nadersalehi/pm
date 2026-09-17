import * as api from "@/lib/api";

const fetchMock = vi.fn();

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );

const lastCall = () => {
  const [path, init] = fetchMock.mock.calls.at(-1)!;
  return { path, method: init?.method ?? "GET", body: init?.body && JSON.parse(init.body) };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  api.setUnauthorizedHandler(null);
});

const apiBoard = {
  id: "board-7",
  name: "Launch",
  description: "Q4",
  labels: [{ id: "label-1", name: "Bug", color: "navy" }],
  columns: [
    {
      id: "col-1",
      title: "Todo",
      cards: [
        {
          id: "card-1",
          title: "A",
          details: "",
          priority: "high",
          due_date: "2026-10-01",
          label_ids: ["label-1"],
          checklist: [{ id: "item-1", text: "Do it", done: true }],
        },
        {
          id: "card-2",
          title: "B",
          details: "x",
          priority: "none",
          due_date: null,
          label_ids: [],
          checklist: [],
        },
      ],
    },
    { id: "col-2", title: "Done", cards: [] },
  ],
};

describe("api client", () => {
  it("normalizes a board into columns with card ids and a card map", async () => {
    respond(200, apiBoard);
    const board = await api.fetchBoard("board-7");
    expect(lastCall()).toMatchObject({ path: "/api/boards/board-7", method: "GET" });
    expect(board).toEqual({
      id: "board-7",
      name: "Launch",
      description: "Q4",
      labels: [{ id: "label-1", name: "Bug", color: "navy" }],
      columns: [
        { id: "col-1", title: "Todo", cardIds: ["card-1", "card-2"] },
        { id: "col-2", title: "Done", cardIds: [] },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "A",
          details: "",
          priority: "high",
          dueDate: "2026-10-01",
          labelIds: ["label-1"],
          checklist: [{ id: "item-1", text: "Do it", done: true }],
        },
        "card-2": {
          id: "card-2",
          title: "B",
          details: "x",
          priority: "none",
          dueDate: null,
          labelIds: [],
          checklist: [],
        },
      },
    });
  });

  it("maps board summaries", async () => {
    respond(200, [{ id: "board-1", name: "One", description: "", card_count: 3 }]);
    expect(await api.fetchBoards()).toEqual([
      { id: "board-1", name: "One", description: "", cardCount: 3 },
    ]);
  });

  it("sends card fields in the backend's snake_case shape", async () => {
    respond(201, {
      id: "card-9",
      title: "T",
      details: "D",
      priority: "low",
      due_date: "2026-01-02",
      label_ids: ["label-1"],
      checklist: [],
    });
    const card = await api.addCard("col-1", {
      title: "T",
      details: "D",
      priority: "low",
      dueDate: "2026-01-02",
      labelIds: ["label-1"],
    });
    expect(lastCall()).toEqual({
      path: "/api/columns/col-1/cards",
      method: "POST",
      body: {
        title: "T",
        details: "D",
        priority: "low",
        due_date: "2026-01-02",
        label_ids: ["label-1"],
      },
    });
    expect(card.dueDate).toBe("2026-01-02");
  });

  it("only sends the fields present in a card patch", async () => {
    respond(200, { id: "card-1", title: "New", details: "", priority: "none", due_date: null });
    await api.updateCard("card-1", { title: "New" });
    expect(lastCall()).toEqual({ path: "/api/cards/card-1", method: "PATCH", body: { title: "New" } });

    respond(200, { id: "card-1", title: "New", details: "", priority: "none", due_date: null });
    await api.updateCard("card-1", { dueDate: null });
    expect(lastCall().body).toEqual({ due_date: null });

    respond(200, { id: "card-1", title: "New", details: "", priority: "none", due_date: null, label_ids: [], checklist: [] });
    await api.updateCard("card-1", { labelIds: [] });
    expect(lastCall().body).toEqual({ label_ids: [] });
  });

  it.each([
    ["createBoard", () => api.createBoard("N", "D"), "POST", "/api/boards", { name: "N", description: "D" }],
    ["updateBoard", () => api.updateBoard("board-1", { name: "N" }), "PATCH", "/api/boards/board-1", { name: "N" }],
    ["addColumn", () => api.addColumn("board-1", "Blocked"), "POST", "/api/boards/board-1/columns", { title: "Blocked" }],
    ["renameColumn", () => api.renameColumn("col-1", "X"), "PATCH", "/api/columns/col-1", { title: "X" }],
    ["moveColumn", () => api.moveColumn("col-1", 2), "POST", "/api/columns/col-1/move", { index: 2 }],
    ["moveCard", () => api.moveCard("card-1", "col-2", 0), "POST", "/api/cards/card-1/move", { column_id: "col-2", index: 0 }],
    ["sendChatMessage", () => api.sendChatMessage("board-1", "hi", []), "POST", "/api/boards/board-1/chat", { message: "hi", history: [] }],
    ["createLabel", () => api.createLabel("board-1", "Bug", "navy"), "POST", "/api/boards/board-1/labels", { name: "Bug", color: "navy" }],
    ["updateLabel", () => api.updateLabel("label-1", { color: "gray" }), "PATCH", "/api/labels/label-1", { color: "gray" }],
    ["addChecklistItem", () => api.addChecklistItem("card-1", "Do it"), "POST", "/api/cards/card-1/checklist", { text: "Do it" }],
    ["updateChecklistItem", () => api.updateChecklistItem("item-1", { done: true }), "PATCH", "/api/checklist/item-1", { done: true }],
  ] as const)("%s calls the right endpoint", async (_, call, method, path, body) => {
    const responses: Record<string, unknown> = {
      createBoard: apiBoard,
      updateBoard: apiBoard,
      addColumn: { id: "col-3", title: "Blocked", cards: [] },
      sendChatMessage: { reply: "ok", board: apiBoard },
      createLabel: { id: "label-1", name: "Bug", color: "navy" },
      updateLabel: { id: "label-1", name: "Bug", color: "gray" },
      addChecklistItem: { id: "item-1", text: "Do it", done: false },
      updateChecklistItem: { id: "item-1", text: "Do it", done: true },
    };
    respond(responses[_] === undefined ? 204 : 200, responses[_]);
    await call();
    expect(lastCall()).toEqual({ path, method, body });
  });

  it.each([
    ["deleteBoard", () => api.deleteBoard("board-1"), "/api/boards/board-1"],
    ["deleteColumn", () => api.deleteColumn("col-1"), "/api/columns/col-1"],
    ["deleteCard", () => api.deleteCard("card-1"), "/api/cards/card-1"],
    ["deleteLabel", () => api.deleteLabel("label-1"), "/api/labels/label-1"],
    ["deleteChecklistItem", () => api.deleteChecklistItem("item-1"), "/api/checklist/item-1"],
  ] as const)("%s sends DELETE and resolves on 204", async (_, call, path) => {
    respond(204);
    await expect(call()).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({ path, method: "DELETE" });
  });

  it("throws ApiError with the server's detail message", async () => {
    respond(404, { detail: "Board not found" });
    const error = await api.fetchBoard("board-404").catch((e) => e);
    expect(error).toBeInstanceOf(api.ApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Board not found");
  });

  it("falls back to a generic message when the body isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(api.fetchBoards()).rejects.toThrow("Request to /api/boards failed with 500");
  });

  it("notifies the unauthorized handler on 401", async () => {
    const handler = vi.fn();
    api.setUnauthorizedHandler(handler);
    respond(401, { detail: "Not authenticated" });
    await expect(api.fetchBoards()).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();

    respond(500, {});
    await expect(api.fetchBoards()).rejects.toMatchObject({ status: 500 });
    expect(handler).toHaveBeenCalledOnce();
  });
});
