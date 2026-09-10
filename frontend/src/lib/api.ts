import type { BoardData, Card, Column } from "@/lib/kanban";

type ApiCard = { id: string; title: string; details: string };
type ApiColumn = { id: string; title: string; cards: ApiCard[] };
type ApiBoard = { columns: ApiColumn[] };

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
};

const toBoardData = (board: ApiBoard): BoardData => {
  const cards: Record<string, Card> = {};
  const columns: Column[] = board.columns.map((column) => {
    const cardIds = column.cards.map((card) => {
      cards[card.id] = { id: card.id, title: card.title, details: card.details };
      return card.id;
    });
    return { id: column.id, title: column.title, cardIds };
  });
  return { columns, cards };
};

export const fetchBoard = async (): Promise<BoardData> => {
  const board = await request<ApiBoard>("/api/board");
  return toBoardData(board);
};

export const renameColumn = (columnId: string, title: string): Promise<ApiColumn> =>
  request(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const addCard = (
  columnId: string,
  title: string,
  details: string
): Promise<ApiCard> =>
  request(`/api/columns/${columnId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, details }),
  });

export const deleteCard = (cardId: string): Promise<void> =>
  request(`/api/cards/${cardId}`, { method: "DELETE" });

export const moveCard = (
  cardId: string,
  columnId: string,
  index: number
): Promise<ApiCard> =>
  request(`/api/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, index }),
  });

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const sendChatMessage = async (
  message: string,
  history: ChatMessage[]
): Promise<{ reply: string; board: BoardData }> => {
  const response = await request<{ reply: string; board: ApiBoard }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
  return { reply: response.reply, board: toBoardData(response.board) };
};
