"use client";

import { useEffect, useState } from "react";
import {
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCw,
  SquareKanban,
  UserCog,
} from "lucide-react";
import { AccountDialog } from "@/components/AccountDialog";
import { BoardDialog } from "@/components/BoardDialog";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { IconButton } from "@/components/IconButton";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import type { BoardSummary } from "@/lib/kanban";

type WorkspaceProps = {
  user: SessionUser;
  onLogout: () => void;
  onAccountDeleted: () => void;
};

const storageKey = (username: string) => `kanban-studio:last-board:${username}`;

const readLastBoard = (username: string): string | null => {
  try {
    return localStorage.getItem(storageKey(username));
  } catch {
    return null;
  }
};

const rememberBoard = (username: string, boardId: string) => {
  try {
    localStorage.setItem(storageKey(username), boardId);
  } catch {
    // storage unavailable (private mode); remembering the board is best-effort
  }
};

const initialBoardId = (boards: BoardSummary[], username: string): string | null => {
  const remembered = readLastBoard(username);
  return boards.find((board) => board.id === remembered)?.id ?? boards[0]?.id ?? null;
};

export const Workspace = ({ user, onLogout, onAccountDeleted }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [dialog, setDialog] = useState<"create-board" | "account" | null>(null);

  const loadBoards = () => {
    setLoadError(false);
    api
      .fetchBoards()
      .then((list) => {
        setBoards(list);
        setActiveBoardId(initialBoardId(list, user.username));
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    api
      .fetchBoards()
      .then((list) => {
        setBoards(list);
        setActiveBoardId(initialBoardId(list, user.username));
      })
      .catch(() => setLoadError(true));
  }, [user.username]);

  const selectBoard = (boardId: string) => {
    setActiveBoardId(boardId);
    rememberBoard(user.username, boardId);
  };

  const refreshBoardList = () => {
    api
      .fetchBoards()
      .then(setBoards)
      .catch(() => {});
  };

  const handleCreateBoard = async (name: string, description: string) => {
    const board = await api.createBoard(name, description);
    setBoards((prev) => [
      ...(prev ?? []),
      { id: board.id, name: board.name, description: board.description, cardCount: 0 },
    ]);
    selectBoard(board.id);
  };

  const handleBoardRenamed = (renamed: { id: string; name: string; description: string }) => {
    setBoards((prev) =>
      (prev ?? []).map((board) => (board.id === renamed.id ? { ...board, ...renamed } : board))
    );
  };

  const handleBoardDeleted = (boardId: string) => {
    const remaining = (boards ?? []).filter((board) => board.id !== boardId);
    setBoards(remaining);
    setActiveBoardId(remaining[0]?.id ?? null);
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--stroke)] bg-white/80 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
            <SquareKanban className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="sr-only font-display text-lg font-semibold text-[var(--navy-dark)] sm:not-sr-only">
            Kanban Studio
          </h1>
        </div>
        {boards && boards.length > 0 && (
          <BoardSwitcher
            boards={boards}
            activeBoardId={activeBoardId}
            onOpen={refreshBoardList}
            onSelect={selectBoard}
            onCreate={() => setDialog("create-board")}
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          {activeBoardId && (
            <IconButton
              label={isChatOpen ? "Hide AI assistant" : "Show AI assistant"}
              icon={isChatOpen ? PanelRightClose : PanelRightOpen}
              onClick={() => setIsChatOpen((open) => !open)}
              pressed={isChatOpen}
              className="h-9 w-9"
            />
          )}
          <span className="hidden px-2 text-sm text-[var(--gray-text)] md:inline">
            {user.username}
          </span>
          <IconButton
            label="Account settings"
            icon={UserCog}
            onClick={() => setDialog("account")}
            className="h-9 w-9"
          />
          <IconButton label="Log out" icon={LogOut} onClick={onLogout} className="h-9 w-9" />
        </div>
      </header>

      {loadError ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-[var(--gray-text)]">Couldn&apos;t load your boards.</p>
          <button
            type="button"
            onClick={loadBoards}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            Retry
          </button>
        </main>
      ) : boards === null ? (
        <main className="flex flex-1 items-center justify-center text-sm text-[var(--gray-text)]">
          Loading boards...
        </main>
      ) : activeBoardId ? (
        <KanbanBoard
          key={activeBoardId}
          boardId={activeBoardId}
          isChatOpen={isChatOpen}
          onBoardRenamed={handleBoardRenamed}
          onBoardDeleted={handleBoardDeleted}
        />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            No boards yet
          </h2>
          <p className="max-w-sm text-sm text-[var(--gray-text)]">
            Boards hold your columns and cards. Create one to start planning.
          </p>
          <button
            type="button"
            onClick={() => setDialog("create-board")}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create a board
          </button>
        </main>
      )}

      {dialog === "create-board" && (
        <BoardDialog
          title="New board"
          submitLabel="Create board"
          onSubmit={handleCreateBoard}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "account" && (
        <AccountDialog
          username={user.username}
          onAccountDeleted={onAccountDeleted}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
};
