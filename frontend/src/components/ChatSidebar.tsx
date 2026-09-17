"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";
import type { BoardData } from "@/lib/kanban";
import * as api from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import { IconButton } from "@/components/IconButton";

type ChatSidebarProps = {
  boardId: string;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ boardId, onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const { reply, board } = await api.sendChatMessage(boardId, trimmed, history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      onBoardUpdate(board);
    } catch {
      setError("Couldn't reach the assistant. Try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-[480px] w-full flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[0_4px_12px_rgba(3,33,71,0.06)] lg:h-full lg:w-[300px] lg:shrink-0 2xl:w-[360px]">
      <header className="flex items-center gap-2 border-b border-[var(--stroke)] px-4 py-3">
        <Sparkles className="h-4 w-4 text-[var(--accent-yellow)]" aria-hidden />
        <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
          AI Assistant
        </h2>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask for board changes, e.g. &quot;add a card to Backlog called Follow
            up with design&quot;.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[var(--secondary-purple)] px-3 py-2 text-sm text-white"
                : "mr-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)]"
            }
          >
            {message.content}
          </div>
        ))}
        {isSending && (
          <div className="mr-auto rounded-2xl rounded-bl-sm bg-[var(--surface)] px-3 py-2 text-sm text-[var(--gray-text)]">
            Thinking...
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="px-4 pb-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-[var(--stroke)] p-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the AI..."
          aria-label="Chat message"
          disabled={isSending}
          className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white disabled:opacity-60"
        />
        <IconButton
          label="Send"
          icon={SendHorizontal}
          type="submit"
          variant="primary"
          disabled={isSending || !input.trim()}
          className="h-9 w-9"
        />
      </form>
    </aside>
  );
};
