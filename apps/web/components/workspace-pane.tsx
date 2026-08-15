"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  ExternalLink,
  Globe,
  Loader2,
  PanelRightClose,
  RefreshCw,
  Terminal,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getCookie } from "@/src/lib/get-cookie";
import { SERVICES } from "@/src/lib/services";

const AGENT_API = SERVICES.agent;

type TabId = "editor" | "browser";

type PaneState = {
  url: string | null;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  nonce: number;
};

const EMPTY: PaneState = {
  url: null,
  loading: false,
  error: null,
  loaded: false,
  nonce: 0,
};

// A cold sandbox pane can briefly fail while code-server / the browser stack
// boots. Retry a couple of times automatically before surfacing an error so the
// user never has to click "Try again" on the first launch.
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 2500;

const TABS: {
  id: TabId;
  label: string;
  Icon: typeof Terminal;
}[] = [
  { id: "editor", label: "Editor", Icon: Terminal },
  { id: "browser", label: "Browser", Icon: Globe },
];

// The code editor + shell and the live browser, both backed by the chat's
// sandbox. Each tab lazy-loads its URL on first view and stays mounted after so
// the running session persists while switching tabs.
export function WorkspacePane({
  chatId,
  onRetract,
}: {
  chatId: string;
  onRetract: () => void;
}) {
  const [tab, setTab] = useState<TabId>("editor");
  const [editor, setEditor] = useState<PaneState>(EMPTY);
  const [browser, setBrowser] = useState<PaneState>(EMPTY);

  const load = async (which: TabId, attempt = 0) => {
    const setState = which === "editor" ? setEditor : setBrowser;
    setState((s) => ({ ...s, loading: true, error: null, loaded: true }));
    try {
      const token = getCookie("authorization") ?? "";
      const res = await axios.post(`${AGENT_API}/chat/${which}`, {
        authorization: `Bearer ${token}`,
        chat_id: chatId,
      });
      const url: string | null = res.data?.url ?? null;
      if (!url) throw new Error("No URL was returned.");
      setState((s) => ({
        ...s,
        url,
        loading: false,
        error: null,
        nonce: s.nonce + 1,
      }));
    } catch {
      // Auto-retry a first cold launch instead of forcing a manual click. The
      // spinner stays up between attempts.
      if (attempt < MAX_AUTO_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return load(which, attempt + 1);
      }
      setState((s) => ({
        ...s,
        loading: false,
        error:
          which === "editor"
            ? "Couldn't start the editor. Give it a moment, then try again."
            : "Couldn't start the browser. First launch installs Chromium and can take a minute — try again.",
      }));
    }
  };

  const selectTab = (next: TabId) => {
    setTab(next);
    const st = next === "editor" ? editor : browser;
    if (!st.loaded && !st.loading) void load(next);
  };

  // Editor is the default tab — load it on mount.
  useEffect(() => {
    void load("editor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const current = tab === "editor" ? editor : browser;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(tab)}
            disabled={current.loading}
            title="Restart"
          >
            <RefreshCw
              className={cn("size-4", current.loading && "animate-spin")}
            />
          </Button>
          {current.url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(current.url!, "_blank", "noopener,noreferrer")
              }
              title="Open in new tab"
            >
              <ExternalLink className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRetract}
            title="Hide panel"
            aria-label="Hide panel"
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PaneBody
          state={editor}
          visible={tab === "editor"}
          title="Sandbox editor"
          loadingText="Starting the editor… first launch installs code-server, which can take a little while."
          onRetry={() => void load("editor")}
        />
        <PaneBody
          state={browser}
          visible={tab === "browser"}
          title="Sandbox browser"
          loadingText="Starting the browser… first launch installs Chromium, which can take a minute."
          onRetry={() => void load("browser")}
        />
      </div>
    </div>
  );
}

function PaneBody({
  state,
  visible,
  title,
  loadingText,
  onRetry,
}: {
  state: PaneState;
  visible: boolean;
  title: string;
  loadingText: string;
  onRetry: () => void;
}) {
  // Stay mounted once a URL exists so the sandbox session survives tab switches.
  if (!visible && !state.url) return null;
  return (
    <div className={cn("absolute inset-0", !visible && "hidden")}>
      {state.loading ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          {loadingText}
        </div>
      ) : state.error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="size-6 text-destructive" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {state.error}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      ) : state.url ? (
        <iframe
          key={state.nonce}
          src={state.url}
          title={title}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      ) : null}
    </div>
  );
}
