import type {
  BoardData,
  BoardSummary,
  Card,
  ChecklistItem,
  Column,
  Label,
  LabelColor,
  Priority,
} from "@/lib/kanban";

type ApiCard = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  due_date: string | null;
  label_ids: string[];
  checklist: ChecklistItem[];
};
type ApiColumn = { id: string; title: string; cards: ApiCard[] };
type ApiBoard = {
  id: string;
  name: string;
  description: string;
  labels: Label[];
  columns: ApiColumn[];
};
type ApiBoardSummary = {
  id: string;
  name: string;
  description: string;
  card_count: number;
};

export type CardInput = {
  title: string;
  details: string;
  priority: Priority;
  dueDate: string | null;
  labelIds: string[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

let unauthorizedHandler: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

const errorDetail = async (response: Response): Promise<string | null> => {
  try {
    const body = await response.json();
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    const detail = await errorDetail(response);
    throw new ApiError(
      response.status,
      detail ?? `Request to ${path} failed with ${response.status}`
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
};

const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const toCard = (card: ApiCard): Card => ({
  id: card.id,
  title: card.title,
  details: card.details,
  priority: card.priority,
  dueDate: card.due_date,
  labelIds: card.label_ids,
  checklist: card.checklist,
});

const toBoardData = (board: ApiBoard): BoardData => {
  const cards: Record<string, Card> = {};
  const columns: Column[] = board.columns.map((column) => ({
    id: column.id,
    title: column.title,
    cardIds: column.cards.map((card) => {
      cards[card.id] = toCard(card);
      return card.id;
    }),
  }));
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    labels: board.labels,
    columns,
    cards,
  };
};

const toCardPayload = ({ dueDate, labelIds, ...rest }: Partial<CardInput>) => ({
  ...rest,
  ...(dueDate === undefined ? {} : { due_date: dueDate }),
  ...(labelIds === undefined ? {} : { label_ids: labelIds }),
});

export const fetchBoards = async (): Promise<BoardSummary[]> => {
  const boards = await request<ApiBoardSummary[]>("/api/boards");
  return boards.map(({ card_count, ...board }) => ({ ...board, cardCount: card_count }));
};

export const createBoard = async (name: string, description = ""): Promise<BoardData> =>
  toBoardData(await send<ApiBoard>("POST", "/api/boards", { name, description }));

export const fetchBoard = async (boardId: string): Promise<BoardData> =>
  toBoardData(await request<ApiBoard>(`/api/boards/${boardId}`));

export const updateBoard = async (
  boardId: string,
  patch: { name?: string; description?: string }
): Promise<BoardData> =>
  toBoardData(await send<ApiBoard>("PATCH", `/api/boards/${boardId}`, patch));

export const deleteBoard = (boardId: string): Promise<void> =>
  send("DELETE", `/api/boards/${boardId}`);

export const addColumn = async (boardId: string, title: string): Promise<Column> => {
  const column = await send<ApiColumn>("POST", `/api/boards/${boardId}/columns`, { title });
  return { id: column.id, title: column.title, cardIds: [] };
};

export const renameColumn = (columnId: string, title: string): Promise<void> =>
  send("PATCH", `/api/columns/${columnId}`, { title });

export const deleteColumn = (columnId: string): Promise<void> =>
  send("DELETE", `/api/columns/${columnId}`);

export const moveColumn = (columnId: string, index: number): Promise<void> =>
  send("POST", `/api/columns/${columnId}/move`, { index });

export const addCard = async (columnId: string, input: CardInput): Promise<Card> =>
  toCard(await send<ApiCard>("POST", `/api/columns/${columnId}/cards`, toCardPayload(input)));

export const updateCard = async (
  cardId: string,
  patch: Partial<CardInput>
): Promise<Card> =>
  toCard(await send<ApiCard>("PATCH", `/api/cards/${cardId}`, toCardPayload(patch)));

export const deleteCard = (cardId: string): Promise<void> =>
  send("DELETE", `/api/cards/${cardId}`);

export const moveCard = async (
  cardId: string,
  columnId: string,
  index: number
): Promise<void> => {
  await send("POST", `/api/cards/${cardId}/move`, { column_id: columnId, index });
};

export const createLabel = (boardId: string, name: string, color: LabelColor): Promise<Label> =>
  send("POST", `/api/boards/${boardId}/labels`, { name, color });

export const updateLabel = (
  labelId: string,
  patch: { name?: string; color?: LabelColor }
): Promise<Label> => send("PATCH", `/api/labels/${labelId}`, patch);

export const deleteLabel = (labelId: string): Promise<void> =>
  send("DELETE", `/api/labels/${labelId}`);

export const addChecklistItem = (cardId: string, text: string): Promise<ChecklistItem> =>
  send("POST", `/api/cards/${cardId}/checklist`, { text });

export const updateChecklistItem = (
  itemId: string,
  patch: { text?: string; done?: boolean }
): Promise<ChecklistItem> => send("PATCH", `/api/checklist/${itemId}`, patch);

export const deleteChecklistItem = (itemId: string): Promise<void> =>
  send("DELETE", `/api/checklist/${itemId}`);

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const sendChatMessage = async (
  boardId: string,
  message: string,
  history: ChatMessage[]
): Promise<{ reply: string; board: BoardData }> => {
  const response = await send<{ reply: string; board: ApiBoard }>(
    "POST",
    `/api/boards/${boardId}/chat`,
    { message, history }
  );
  return { reply: response.reply, board: toBoardData(response.board) };
};
