"use client";

import {
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ChatListItem = {
  id: string;
  title: string | null;
  createdAt: string;
};

export function ChatSidebar({
  chats,
  loading,
  activeChatId,
  onNewChat,
  onSelectChat,
  collapsed = false,
  onToggleCollapsed,
}: {
  chats: ChatListItem[];
  loading: boolean;
  activeChatId?: string | null;
  onNewChat: () => void;
  onSelectChat?: (chatId: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  if (collapsed) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-card/40 py-2 md:flex">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleCollapsed}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="mt-1"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNewChat}
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="size-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">krek-ai</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleCollapsed}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="ml-auto"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <Plus className="size-4" />
          New chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Chats
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No chats yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => onSelectChat?.(chat.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    activeChatId === chat.id && "bg-muted text-foreground",
                  )}
                >
                  <MessageSquare className="size-4 shrink-0" />
                  <span className="truncate">
                    {chat.title?.trim() || "Untitled chat"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
