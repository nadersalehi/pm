"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  SquareKanban,
} from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { moveCard as moveCardLocally, type BoardData } from "@/lib/kanban";
import * as api from "@/lib/api";

type KanbanBoardProps = {
  onLogout: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | undefined>();
  const [isChatOpen, setIsChatOpen] = useState(true);

  const loadBoard = () => {
    setLoadError(false);
    api
      .fetchBoard()
      .then(setBoard)
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    api
      .fetchBoard()
      .then(setBoard)
      .catch(() => setLoadError(true));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

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
    const overId = over.id as string;

    const nextColumns = moveCardLocally(board.columns, activeId, overId);
    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(activeId)
    );

    setMutationError(null);
    setBoard({ ...board, columns: nextColumns });

    if (targetColumn) {
      const index = targetColumn.cardIds.indexOf(activeId);
      api.moveCard(activeId, targetColumn.id, index).catch(() => {
        setMutationError("Couldn't save that move.");
        loadBoard();
      });
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
      .catch(() => setMutationError("Couldn't save the column name."));
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    setMutationError(null);
    try {
      const card = await api.addCard(
        columnId,
        title,
        details || "No details yet."
      );
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

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    setMutationError(null);
    try {
      await api.deleteCard(cardId);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              cards: Object.fromEntries(
                Object.entries(prev.cards).filter(([id]) => id !== cardId)
              ),
              columns: prev.columns.map((column) =>
                column.id === columnId
                  ? {
                      ...column,
                      cardIds: column.cardIds.filter((id) => id !== cardId),
                    }
                  : column
              ),
            }
          : prev
      );
    } catch {
      setMutationError("Couldn't delete the card.");
    }
  };

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-[var(--gray-text)]">
          Couldn&apos;t load the board.
        </p>
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
      <main className="flex min-h-dvh items-center justify-center text-sm text-[var(--gray-text)]">
        Loading board...
      </main>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const cardCount = Object.keys(board.cards).length;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--stroke)] bg-white/80 px-4 py-3 backdrop-blur lg:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
            <SquareKanban className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold leading-tight text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="text-xs text-[var(--gray-text)]">
              {board.columns.length} columns &middot; {cardCount}{" "}
              {cardCount === 1 ? "card" : "cards"}
            </p>
          </div>
        </div>
        {mutationError && (
          <p
            role="alert"
            className="order-last w-full rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-600 sm:order-none sm:w-auto"
          >
            {mutationError}
          </p>
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={isChatOpen ? "Hide AI assistant" : "Show AI assistant"}
            icon={isChatOpen ? PanelRightClose : PanelRightOpen}
            onClick={() => setIsChatOpen((open) => !open)}
            pressed={isChatOpen}
            className="h-9 w-9"
          />
          <IconButton
            label="Log out"
            icon={LogOut}
            onClick={onLogout}
            className="h-9 w-9"
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4 lg:min-h-0 lg:flex-row lg:p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            aria-label="Board"
            className="grid min-w-0 flex-1 snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[minmax(240px,1fr)] lg:-m-2 lg:min-h-0 lg:snap-none lg:auto-cols-[minmax(200px,1fr)] lg:gap-3 lg:p-2"
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameColumnCommit}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div style={{ width: overlayWidth }}>
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <div hidden={!isChatOpen} className="lg:min-h-0">
          <ChatSidebar onBoardUpdate={setBoard} />
        </div>
      </main>
    </div>
  );
};
