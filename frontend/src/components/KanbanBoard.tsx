"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Columns3, RotateCw, Search, Settings2, Tags } from "lucide-react";
import { BoardDialog } from "@/components/BoardDialog";
import { CardDialog } from "@/components/CardDialog";
import { ChatSidebar } from "@/components/ChatSidebar";
import { FilterMenu } from "@/components/FilterMenu";
import { IconButton } from "@/components/IconButton";
import { LabelsDialog } from "@/components/LabelsDialog";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { KanbanColumn } from "@/components/KanbanColumn";
import { ConfirmDialog, Modal, fieldClass } from "@/components/Modal";
import * as api from "@/lib/api";
import {
  EMPTY_FILTER,
  activeFilterCount,
  cardMatches,
  cardPassesFilter,
  moveCard as moveCardLocally,
  toIsoDate,
  type BoardData,
  type Card,
  type CardFilter,
  type LabelColor,
} from "@/lib/kanban";

const dragAnnouncements = (board: BoardData): Announcements => {
  const cardTitle = (id: UniqueIdentifier) => board.cards[id]?.title ?? "card";
  const place = (id: UniqueIdentifier) => {
    const column =
      board.columns.find((c) => c.id === id) ??
      board.columns.find((c) => c.cardIds.includes(id as string));
    return column ? `the ${column.title} column` : "the board";
  };
  return {
    onDragStart: ({ active }) => `Picked up ${cardTitle(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${cardTitle(active.id)} is over ${place(over.id)}.`
        : `${cardTitle(active.id)} is not over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${cardTitle(active.id)} was dropped in ${place(over.id)}.`
        : `${cardTitle(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${cardTitle(active.id)} was cancelled.`,
  };
};

type KanbanBoardProps = {
  boardId: string;
  isChatOpen: boolean;
  onBoardRenamed: (board: { id: string; name: string; description: string }) => void;
  onBoardDeleted: (boardId: string) => void;
};

type Dialog =
  | { kind: "card"; cardId: string }
  | { kind: "delete-column"; columnId: string }
  | { kind: "add-column" }
  | { kind: "labels" }
  | { kind: "board-settings" }
  | { kind: "delete-board" };

export const KanbanBoard = ({
  boardId,
  isChatOpen,
  onBoardRenamed,
  onBoardDeleted,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | undefined>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");

  const loadBoard = () => {
    setLoadError(false);
    api
      .fetchBoard(boardId)
      .then(setBoard)
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    api
      .fetchBoard(boardId)
      .then(setBoard)
      .catch(() => setLoadError(true));
  }, [boardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    // Space picks up and drops a card (Enter is kept for opening it).
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const updateCard = (cardId: string, update: (card: Card) => Card) =>
    setBoard((prev) =>
      prev ? { ...prev, cards: { ...prev.cards, [cardId]: update(prev.cards[cardId]) } } : prev
    );

  const fail = (message: string, resync = false) => () => {
    setMutationError(message);
    if (resync) {
      loadBoard();
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    setOverlayWidth(event.active.rect.current.initial?.width);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id || !board) {
      return;
    }

    const activeId = active.id as string;
    const nextColumns = moveCardLocally(board.columns, activeId, over.id as string);
    const targetColumn = nextColumns.find((column) => column.cardIds.includes(activeId));

    setMutationError(null);
    setBoard({ ...board, columns: nextColumns });

    if (targetColumn) {
      api
        .moveCard(activeId, targetColumn.id, targetColumn.cardIds.indexOf(activeId))
        .catch(fail("Couldn't save that move.", true));
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) =>
              column.id === columnId ? { ...column, title } : column
            ),
          }
        : prev
    );
  };

  const handleRenameColumnCommit = (columnId: string, title: string) => {
    setMutationError(null);
    api
      .renameColumn(columnId, title)
      .catch(fail("Couldn't save the column name.", true));
  };

  const handleMoveColumn = (columnId: string, direction: -1 | 1) => {
    if (!board) {
      return;
    }
    const from = board.columns.findIndex((column) => column.id === columnId);
    const to = from + direction;
    const columns = [...board.columns];
    const [moved] = columns.splice(from, 1);
    columns.splice(to, 0, moved);
    setMutationError(null);
    setBoard({ ...board, columns });
    api.moveColumn(columnId, to).catch(fail("Couldn't move the column.", true));
  };

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title || !board) {
      return;
    }
    setMutationError(null);
    try {
      const column = await api.addColumn(board.id, title);
      setBoard((prev) => (prev ? { ...prev, columns: [...prev.columns, column] } : prev));
      setNewColumnTitle("");
      setDialog(null);
    } catch {
      setMutationError("Couldn't add the column.");
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    setDialog(null);
    setMutationError(null);
    try {
      await api.deleteColumn(columnId);
      setBoard((prev) => {
        if (!prev) {
          return prev;
        }
        const removed = prev.columns.find((column) => column.id === columnId);
        const cards = { ...prev.cards };
        removed?.cardIds.forEach((cardId) => delete cards[cardId]);
        return {
          ...prev,
          cards,
          columns: prev.columns.filter((column) => column.id !== columnId),
        };
      });
    } catch {
      setMutationError("Couldn't delete the column.");
    }
  };

  const handleAddCard = async (columnId: string, input: api.CardInput) => {
    setMutationError(null);
    try {
      const card = await api.addCard(columnId, input);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              cards: { ...prev.cards, [card.id]: card },
              columns: prev.columns.map((column) =>
                column.id === columnId
                  ? { ...column, cardIds: [...column.cardIds, card.id] }
                  : column
              ),
            }
          : prev
      );
    } catch (error) {
      setMutationError("Couldn't add the card.");
      throw error;
    }
  };

  const handleSaveCard = async (cardId: string, patch: api.CardInput) => {
    const card = await api.updateCard(cardId, patch);
    setBoard((prev) =>
      prev ? { ...prev, cards: { ...prev.cards, [card.id]: card } } : prev
    );
  };

  const handleDeleteCard = async (cardId: string) => {
    setMutationError(null);
    try {
      await api.deleteCard(cardId);
      setBoard((prev) => {
        if (!prev) {
          return prev;
        }
        const cards = { ...prev.cards };
        delete cards[cardId];
        return {
          ...prev,
          cards,
          columns: prev.columns.map((column) => ({
            ...column,
            cardIds: column.cardIds.filter((id) => id !== cardId),
          })),
        };
      });
    } catch {
      setMutationError("Couldn't delete the card.");
    }
  };

  const handleAddChecklistItem = async (cardId: string, text: string) => {
    const item = await api.addChecklistItem(cardId, text);
    updateCard(cardId, (card) => ({ ...card, checklist: [...card.checklist, item] }));
  };

  const handleToggleChecklistItem = async (cardId: string, itemId: string, done: boolean) => {
    const setDone = (value: boolean) =>
      updateCard(cardId, (card) => ({
        ...card,
        checklist: card.checklist.map((item) =>
          item.id === itemId ? { ...item, done: value } : item
        ),
      }));
    setDone(done);
    try {
      await api.updateChecklistItem(itemId, { done });
    } catch (error) {
      setDone(!done);
      throw error;
    }
  };

  const handleDeleteChecklistItem = async (cardId: string, itemId: string) => {
    await api.deleteChecklistItem(itemId);
    updateCard(cardId, (card) => ({
      ...card,
      checklist: card.checklist.filter((item) => item.id !== itemId),
    }));
  };

  const handleCreateLabel = async (name: string, color: LabelColor) => {
    const label = await api.createLabel(boardId, name, color);
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            labels: [...prev.labels, label].sort((a, b) => a.name.localeCompare(b.name)),
          }
        : prev
    );
  };

  const handleUpdateLabel = async (
    labelId: string,
    patch: { name?: string; color?: LabelColor }
  ) => {
    const label = await api.updateLabel(labelId, patch);
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            labels: prev.labels
              .map((existing) => (existing.id === labelId ? label : existing))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }
        : prev
    );
  };

  const handleDeleteLabel = async (labelId: string) => {
    await api.deleteLabel(labelId);
    setFilter((prev) => ({ ...prev, labelIds: prev.labelIds.filter((id) => id !== labelId) }));
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            labels: prev.labels.filter((label) => label.id !== labelId),
            cards: Object.fromEntries(
              Object.entries(prev.cards).map(([id, card]) => [
                id,
                { ...card, labelIds: card.labelIds.filter((labelIdOnCard) => labelIdOnCard !== labelId) },
              ])
            ),
          }
        : prev
    );
  };

  const handleSaveBoard = async (name: string, description: string) => {
    const updated = await api.updateBoard(boardId, { name, description });
    setBoard((prev) =>
      prev ? { ...prev, name: updated.name, description: updated.description } : prev
    );
    onBoardRenamed({ id: boardId, name: updated.name, description: updated.description });
  };

  const handleDeleteBoard = async () => {
    setDialog(null);
    setMutationError(null);
    try {
      await api.deleteBoard(boardId);
      onBoardDeleted(boardId);
    } catch {
      setMutationError("Couldn't delete the board.");
    }
  };

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-[var(--gray-text)]">Couldn&apos;t load the board.</p>
        <button
          type="button"
          onClick={loadBoard}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Retry
        </button>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-[var(--gray-text)]">
        Loading board...
      </main>
    );
  }

  const today = toIsoDate(new Date());
  const isFiltered = query.trim() !== "" || activeFilterCount(filter) > 0;
  const cardCount = Object.keys(board.cards).length;
  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const openCard = dialog?.kind === "card" ? board.cards[dialog.cardId] : null;
  const columnToDelete =
    dialog?.kind === "delete-column"
      ? board.columns.find((column) => column.id === dialog.columnId)
      : null;

  return (
    <main className="flex flex-1 flex-col gap-3 p-4 lg:min-h-0 lg:p-6 lg:pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-semibold text-[var(--navy-dark)]">
            {board.name}
          </h2>
          <p className="truncate text-xs text-[var(--gray-text)]">
            {board.description ? `${board.description} · ` : ""}
            {board.columns.length} {board.columns.length === 1 ? "column" : "columns"} ·{" "}
            {cardCount} {cardCount === 1 ? "card" : "cards"}
          </p>
        </div>
        <IconButton
          label="Board settings"
          icon={Settings2}
          onClick={() => setDialog({ kind: "board-settings" })}
        />
        {mutationError && (
          <p
            role="alert"
            className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-600"
          >
            {mutationError}
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search cards</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray-text)]"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cards"
              className="w-44 rounded-full border border-[var(--stroke)] bg-white py-1.5 pl-9 pr-3 text-sm text-[var(--navy-dark)] outline-none transition focus:w-56 focus:border-[var(--primary-blue)]"
            />
          </label>
          <FilterMenu filter={filter} labels={board.labels} onChange={setFilter} />
          <IconButton
            label="Manage labels"
            icon={Tags}
            onClick={() => setDialog({ kind: "labels" })}
            className="h-9 w-9 border border-[var(--stroke)] bg-white"
          />
          <IconButton
            label="Add column"
            icon={Columns3}
            onClick={() => setDialog({ kind: "add-column" })}
            className="h-9 w-9 border border-[var(--stroke)] bg-white"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row">
        <DndContext
          accessibility={{
            announcements: dragAnnouncements(board),
            screenReaderInstructions: {
              draggable:
                "Press space to pick up a card, use the arrow keys to move it, and press space again to drop it. Press escape to cancel. Press enter to open the card.",
            },
          }}
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            aria-label="Board"
            className="grid min-w-0 flex-1 snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[minmax(240px,1fr)] lg:-m-2 lg:min-h-0 lg:snap-none lg:auto-cols-[minmax(200px,1fr)] lg:gap-3 lg:p-2"
          >
            {board.columns.length === 0 && (
              <p className="self-center text-sm text-[var(--gray-text)]">
                This board has no columns yet. Use the add column button to create one.
              </p>
            )}
            {board.columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds
                  .map((cardId) => board.cards[cardId])
                  .filter(
                    (card) => cardMatches(card, query) && cardPassesFilter(card, filter, today)
                  )}
                labels={board.labels}
                today={today}
                isFiltered={isFiltered}
                canMoveLeft={index > 0}
                canMoveRight={index < board.columns.length - 1}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameColumnCommit}
                onMove={handleMoveColumn}
                onDelete={(columnId) => setDialog({ kind: "delete-column", columnId })}
                onAddCard={handleAddCard}
                onOpenCard={(cardId) => setDialog({ kind: "card", cardId })}
                onDeleteCard={(_, cardId) => handleDeleteCard(cardId)}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div style={{ width: overlayWidth }}>
                <KanbanCardPreview card={activeCard} today={today} labels={board.labels} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <div hidden={!isChatOpen} className="lg:min-h-0">
          <ChatSidebar boardId={board.id} onBoardUpdate={setBoard} />
        </div>
      </div>

      {openCard && (
        <CardDialog
          card={openCard}
          labels={board.labels}
          onSave={(patch) => handleSaveCard(openCard.id, patch)}
          onAddItem={(text) => handleAddChecklistItem(openCard.id, text)}
          onToggleItem={(itemId, done) => handleToggleChecklistItem(openCard.id, itemId, done)}
          onDeleteItem={(itemId) => handleDeleteChecklistItem(openCard.id, itemId)}
          onDelete={() => {
            setDialog(null);
            handleDeleteCard(openCard.id);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {columnToDelete && (
        <ConfirmDialog
          title="Delete column"
          message={`Delete "${columnToDelete.title}" and its ${columnToDelete.cardIds.length} ${columnToDelete.cardIds.length === 1 ? "card" : "cards"}? This can't be undone.`}
          confirmLabel="Delete column"
          onConfirm={() => handleDeleteColumn(columnToDelete.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "labels" && (
        <LabelsDialog
          labels={board.labels}
          onCreate={handleCreateLabel}
          onUpdate={handleUpdateLabel}
          onDelete={handleDeleteLabel}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "add-column" && (
        <Modal title="Add column" onClose={() => setDialog(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleAddColumn();
            }}
            className="flex gap-2"
          >
            <input
              aria-label="Column name"
              value={newColumnTitle}
              onChange={(event) => setNewColumnTitle(event.target.value)}
              placeholder="e.g. Blocked"
              maxLength={200}
              autoFocus
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={!newColumnTitle.trim()}
              className="shrink-0 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              Add
            </button>
          </form>
        </Modal>
      )}
      {dialog?.kind === "board-settings" && (
        <BoardDialog
          title="Board settings"
          submitLabel="Save"
          initialName={board.name}
          initialDescription={board.description}
          onSubmit={handleSaveBoard}
          onDelete={() => setDialog({ kind: "delete-board" })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete-board" && (
        <ConfirmDialog
          title="Delete board"
          message={`Delete "${board.name}" with all its columns and cards? This can't be undone.`}
          confirmLabel="Delete board"
          onConfirm={handleDeleteBoard}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
};
