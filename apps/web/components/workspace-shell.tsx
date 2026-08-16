"use client";

import { fetchuser } from "@/src/lib/fetch-user";
import { useuserStore } from "@/src/providers/user-store-provider";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { getCookie } from "@/src/lib/get-cookie";
import { toast } from "sonner";
import {
  ArrowUp,
  Check,
  GitBranch,
  Loader2,
  LogOut,
  PanelRightOpen,
  Plus,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChatSidebar, type ChatListItem } from "@/components/chat-sidebar";
import { ChatWindow } from "@/components/chat-window";
import { WorkspacePane } from "@/components/workspace-pane";
import { SERVICES } from "@/src/lib/services";

const CONTROLLER_API = SERVICES.auth;
const AGENT_API = SERVICES.agent;

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4", className)}
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.02 11.02 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

// The full app shell (sidebar + chat + workspace). `chatId` comes from the route
// (`/chat/[id]`); on `/` it's undefined and we render the new-chat landing.
// Chat selection/creation navigates the URL instead of mutating local state, so
// each chat has a shareable/bookmarkable `/chat/{id}` address.
export function WorkspaceShell({ chatId }: { chatId?: string }) {
  const router = useRouter();
  const active_chat_id = chatId ?? null;

  const [user_prompt, set_user_prompt] = useState("");
  const { name, setUser } = useuserStore((state) => state);
  const [user_github_details, set_user_github_details] = useState<{
    id: string;
    login: string;
    avatarUrl: string;
  }>();
  const [user_repos, set_user_repos] = useState<string[]>([]);
  const [selected_repos, set_selected_repos] = useState<string[]>([]);
  const [loading, set_loading] = useState(true);
  const [github_loading, set_github_loading] = useState(true);
  const [chats, set_chats] = useState<ChatListItem[]>([]);
  const [chats_loading, set_chats_loading] = useState(true);
  const [sending, set_sending] = useState(false);
  const [reload_key, set_reload_key] = useState(0);
  const [sidebar_collapsed, set_sidebar_collapsed] = useState(false);
  const [right_pane_open, set_right_pane_open] = useState(true);

  const toggleRepo = (repo: string) => {
    set_selected_repos((prev) =>
      prev.includes(repo) ? prev.filter((r) => r !== repo) : [...prev, repo],
    );
  };

  const searchParams = useSearchParams();
  const github_connected = searchParams.get("github");

  const is_github_connected = (user_github_details?.login?.length ?? 0) > 1;

  const loadGithubData = async () => {
    set_github_loading(true);
    try {
      const [meRes, reposRes] = await Promise.allSettled([
        axios.post(`${CONTROLLER_API}/auth/github/me`, {
          authorization: getCookie("authorization"),
        }),
        axios.post(`${CONTROLLER_API}/auth/github/repos`, {
          authorization: getCookie("authorization"),
        }),
      ]);

      if (meRes.status === "fulfilled")
        set_user_github_details(meRes.value.data);

      if (reposRes.status === "fulfilled")
        set_user_repos(
          reposRes.value.data.repos.map(
            (r: { fullName: string }) => r.fullName,
          ),
        );
    } finally {
      set_github_loading(false);
    }
  };

  const loadChats = async () => {
    set_chats_loading(true);
    try {
      const res = await axios.post(`${AGENT_API}/chats`, {
        authorization: `Bearer ${getCookie("authorization")}`,
      });
      set_chats(res.data.chats ?? []);
    } catch {
      // Sidebar just stays empty on failure.
    } finally {
      set_chats_loading(false);
    }
  };

  const onNewChat = () => {
    set_user_prompt("");
    set_selected_repos([]);
    router.push("/");
  };

  const onLoad = async () => {
    try {
      if (github_connected == "connected")
        toast.success("GitHub connected successfully.");

      const user = await fetchuser();
      if (!user) return;

      setUser({ id: user.id, email: user.email, name: user.name });
    } finally {
      set_loading(false);
    }

    loadGithubData();
    loadChats();
  };

  const connectGithub = () => {
    window.location.href = `${CONTROLLER_API}/auth/github`;
  };

  const disconnectGithub = async () => {
    try {
      const res = await axios.post(`${CONTROLLER_API}/auth/github/disconnect`, {
        authorization: getCookie("authorization"),
      });
      if (res.status == 204) {
        toast.success("GitHub disconnected.");
        set_user_github_details(undefined);
        set_user_repos([]);
        set_selected_repos([]);
      } else {
        toast.error("Failed to disconnect GitHub.");
      }
    } catch {
      toast.error("Failed to disconnect GitHub.");
    }
  };

  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUserSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user_prompt.trim() || sending) return;

    set_sending(true);
    try {
      const res = await axios.post(`${AGENT_API}/chat`, {
        authorization: `Bearer ${getCookie("authorization")}`,
        user_prompt,
        repos: selected_repos,
        ...(active_chat_id ? { chat_id: active_chat_id } : {}),
      });
      const newChatId: string | undefined = res.data?.chatId;
      set_user_prompt("");
      set_selected_repos([]);
      if (newChatId && newChatId !== active_chat_id) {
        // New chat -> route to its live view (`/chat/{id}`).
        router.push(`/chat/${newChatId}`);
      } else {
        // Follow-up on the current chat -> nudge the window to re-stream.
        set_reload_key((k) => k + 1);
      }
      await loadChats();
    } catch {
      toast.error("Failed to start task.");
    } finally {
      set_sending(false);
    }
  };

  const composer = (
    <form onSubmit={onUserSubmit}>
      <div className="rounded-2xl border border-input bg-card shadow-sm transition-[color,box-shadow] duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <div className="px-3 pt-3">
          {selected_repos.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {selected_repos.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/15 py-0.5 pr-1 pl-1.5 text-xs font-medium text-blue-400"
                >
                  <GitBranch className="size-3" />
                  <span className="max-w-40 truncate">{r}</span>
                  <button
                    type="button"
                    onClick={() => toggleRepo(r)}
                    aria-label={`Remove ${r}`}
                    className="rounded-sm text-blue-400/70 transition-colors hover:text-blue-300"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Textarea
            rows={2}
            value={user_prompt}
            onChange={(e) => set_user_prompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onUserSubmit();
              }
            }}
            placeholder={
              selected_repos.length
                ? "Describe the task…"
                : "Ask krek-ai to build something…"
            }
            className="max-h-40 min-h-12 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent"
          />
        </div>

        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
          <Popover>
            <PopoverTrigger
              type="button"
              aria-label="Add repositories"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-72 gap-0 p-0">
              <div className="border-b px-3 py-2">
                <p className="text-sm font-medium">Add repositories</p>
                <p className="text-xs text-muted-foreground">
                  Select repos to include in this task.
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {github_loading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading repositories…
                  </div>
                ) : !is_github_connected ? (
                  <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Connect GitHub to add your repositories.
                    </p>
                    <Button size="sm" onClick={connectGithub}>
                      <GithubMark />
                      Connect GitHub
                    </Button>
                  </div>
                ) : user_repos.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No repositories found.
                  </p>
                ) : (
                  user_repos.map((r) => {
                    const active = selected_repos.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRepo(r)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                          active && "text-blue-400",
                        )}
                      >
                        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r}</span>
                        {active && (
                          <Check className="ml-auto size-4 shrink-0 text-blue-400" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="submit"
            size="icon-sm"
            className="rounded-full transition-transform active:scale-95"
            disabled={!user_prompt.trim() || sending}
            aria-label="Send"
          >
            {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="flex w-screen h-screen">
      <ChatSidebar
        chats={chats}
        loading={chats_loading}
        activeChatId={active_chat_id}
        onNewChat={onNewChat}
        onSelectChat={(id) => router.push(`/chat/${id}`)}
        collapsed={sidebar_collapsed}
        onToggleCollapsed={() => set_sidebar_collapsed((v) => !v)}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-end px-4">
            {loading || github_loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : is_github_connected ? (
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarImage
                    src={user_github_details?.avatarUrl}
                    alt={user_github_details?.login}
                  />
                  <AvatarFallback>
                    {user_github_details?.login?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user_github_details?.login}
                </span>
                <Button variant="ghost" size="sm" onClick={disconnectGithub}>
                  <LogOut />
                  Disconnect
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Loading your workspace…</p>
          </div>
        ) : active_chat_id ? (
          <div className="flex min-h-0 flex-1 ">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <ChatWindow
                  key={active_chat_id}
                  chatId={active_chat_id}
                  reloadKey={reload_key}
                />
              </div>
              <div className="shrink-0 border-t  border-border/60 bg-background/60">
                <div className="mx-auto w-full max-w-3xl px-4 py-4">
                  {composer}
                </div>
              </div>
            </div>

            {right_pane_open ? (
              <div className="hidden min-h-0 w-2/3 shrink-0 border-l border-border/60 lg:flex">
                <WorkspacePane
                  key={active_chat_id}
                  chatId={active_chat_id}
                  onRetract={() => set_right_pane_open(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => set_right_pane_open(true)}
                title="Show workspace"
                className="hidden w-10 shrink-0 flex-col items-center gap-2 border-l border-border/60 bg-card/40 py-3 text-muted-foreground transition-colors hover:text-foreground lg:flex"
              >
                <PanelRightOpen className="size-4" />
                <span className="text-xs [writing-mode:vertical-rl]">
                  Workspace
                </span>
              </button>
            )}
          </div>
        ) : (
          <main className="flex min-h-0 flex-1  flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
              <div className="mb-8 flex flex-col items-center text-center">
                <Badge variant="outline" className="mb-4 gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {name ? `Welcome back, ${name}` : "AI coding agent"}
                </Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  What should we build?
                </h1>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  Describe a task and krek-ai will work across your connected
                  GitHub repositories.
                </p>
              </div>
              {composer}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
