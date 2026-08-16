"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import {
  AlertTriangle,
  Bot,
  GitPullRequest,
  Loader2,
  Terminal,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreatePrDialog } from "@/components/create-pr-dialog";
import { getCookie } from "@/src/lib/get-cookie";
import { SERVICES } from "@/src/lib/services";

const AGENT_API = SERVICES.agent;

type ChatMessage = { role: string; content: string; createdAt?: string };
type PersistedEvent = { channel: string; content: string; createdAt?: string };

type StreamChannel = "parent" | "swarm" | "system" | "error" | "status";
type StreamEvent = { channel: StreamChannel; message: string; ts: number };

type ActivityItem = { channel: string; content: string };

// Agent messages arrive prefixed with "> "; drop it for display.
const stripArrow = (s: string) => s.replace(/^>\s*/, "");

const CHANNEL_META: Record<
  Exclude<StreamChannel, "status">,
  { label: string; Icon: typeof Bot; className: string }
> = {
  parent: { label: "agent", Icon: Bot, className: "text-foreground" },
  system: {
    label: "system",
    Icon: Terminal,
    className: "text-muted-foreground",
  },
  swarm: { label: "sub-agent", Icon: Users, className: "text-blue-400" },
  error: { label: "error", Icon: AlertTriangle, className: "text-destructive" },
};

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Running
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <AlertTriangle className="size-3" />
        Error
      </Badge>
    );
  }
  if (status === "done") {
    return (
      <Badge variant="outline" className="gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Done
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Idle
    </Badge>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

// A neat, grouped block of agent activity (persisted trace or live stream).
function ActivityFeed({
  items,
  running = false,
}: {
  items: ActivityItem[];
  running?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {running ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Bot className="size-3.5" />
        )}
        Agent activity
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const meta = CHANNEL_META[item.channel as keyof typeof CHANNEL_META];
          if (!meta) return null;
          const { label, Icon, className } = meta;
          return (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-0.5 inline-flex w-20 shrink-0 items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                <Icon className="size-3 shrink-0" />
                {label}
              </span>
              <span className={cn("whitespace-pre-wrap break-words", className)}>
                {stripArrow(item.content)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const parseTime = (v?: string) => (v ? Date.parse(v) : 0);

export function ChatWindow({
  chatId,
  reloadKey = 0,
}: {
  chatId: string;
  reloadKey?: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [persistedEvents, setPersistedEvents] = useState<PersistedEvent[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("running");
  const [result, setResult] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [prOpen, setPrOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const token = getCookie("authorization") ?? "";

    const loadDetail = async (): Promise<string> => {
      const res = await axios.post(`${AGENT_API}/chat-detail`, {
        authorization: `Bearer ${token}`,
        chat_id: chatId,
      });
      if (cancelled) return "idle";
      setMessages(res.data?.messages ?? []);
      setPersistedEvents(res.data?.events ?? []);
      setTitle(res.data?.chat?.title ?? null);
      setResult(res.data?.chat?.result ?? null);
      const st: string = res.data?.chat?.status ?? "idle";
      setStatus(st);
      return st;
    };

    const stopPoll = () => {
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    };

    // Fallback if the live stream drops mid-run: poll history until terminal.
    const startPoll = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try {
          const st = await loadDetail();
          if (st !== "running") {
            stopPoll();
            if (!cancelled) setLiveEvents([]);
          }
        } catch {
          /* keep trying */
        }
      }, 3000);
    };

    const openStream = () => {
      const url = `${AGENT_API}/chat/${chatId}/stream?authorization=${encodeURIComponent(
        token,
      )}`;
      es = new EventSource(url);

      es.onmessage = (e) => {
        if (cancelled) return;
        let data: StreamEvent;
        try {
          data = JSON.parse(e.data) as StreamEvent;
        } catch {
          return;
        }

        // Terminal signal: stop streaming and reload the persisted trace, then
        // drop the live events so the canonical (DB) history is the source.
        if (data.channel === "status") {
          setStatus(data.message);
          es?.close();
          es = null;
          void loadDetail().then(() => {
            if (!cancelled) setLiveEvents([]);
          });
          return;
        }
        setLiveEvents((prev) => [...prev, data]);
      };

      es.onerror = () => {
        es?.close();
        es = null;
        // The run may still be going server-side; fall back to polling.
        if (!cancelled) startPoll();
      };
    };

    setLoading(true);
    setLiveEvents([]);
    void (async () => {
      try {
        const st = await loadDetail();
        if (cancelled) return;
        if (st === "running") openStream();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
      es = null;
      stopPoll();
    };
  }, [chatId, reloadKey]);

  // Keep the newest message / activity line in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, persistedEvents, liveEvents]);

  const isRunning = status === "running";

  // Build a chronological transcript: user/assistant bubbles interleaved with
  // grouped activity. Drop parent events that duplicate a persisted assistant
  // message so the final answer isn't shown twice.
  const assistantContents = new Set(
    messages
      .filter((m) => m.role === "assistant")
      .map((m) => stripArrow(m.content).trim()),
  );

  type TItem =
    | { kind: "message"; time: number; message: ChatMessage }
    | { kind: "event"; time: number; item: ActivityItem };

  const timeline: TItem[] = [];
  messages.forEach((m) =>
    timeline.push({ kind: "message", time: parseTime(m.createdAt), message: m }),
  );
  persistedEvents.forEach((e) => {
    const content = stripArrow(e.content);
    if (e.channel === "parent" && assistantContents.has(content.trim())) return;
    timeline.push({
      kind: "event",
      time: parseTime(e.createdAt),
      item: { channel: e.channel, content },
    });
  });
  timeline.sort((a, b) => a.time - b.time);

  const rendered: ReactNode[] = [];
  let buffer: ActivityItem[] = [];
  let key = 0;
  const flush = () => {
    if (buffer.length) {
      rendered.push(<ActivityFeed key={`a-${key++}`} items={buffer} />);
      buffer = [];
    }
  };
  for (const t of timeline) {
    if (t.kind === "event") {
      buffer.push(t.item);
    } else {
      flush();
      rendered.push(<MessageBubble key={`m-${key++}`} message={t.message} />);
    }
  }
  flush();

  const liveItems: ActivityItem[] = liveEvents.map((e) => ({
    channel: e.channel,
    content: e.message,
  }));

  const isEmpty =
    !loading &&
    timeline.length === 0 &&
    liveItems.length === 0 &&
    !(status === "error" && result);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4">
        <h2 className="truncate text-sm font-medium">
          {title?.trim() || "Untitled chat"}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={status} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrOpen(true)}
            title="Create a pull request from this chat's changes"
          >
            <GitPullRequest className="size-4" />
            Create PR
          </Button>
        </div>
      </div>

      {prOpen && (
        <CreatePrDialog chatId={chatId} onClose={() => setPrOpen(false)} />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              {rendered}

              {liveItems.length > 0 && (
                <ActivityFeed items={liveItems} running={isRunning} />
              )}

              {status === "error" && result && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span className="whitespace-pre-wrap break-words">
                    {result}
                  </span>
                </div>
              )}

              {isEmpty && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No messages yet.
                </p>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
