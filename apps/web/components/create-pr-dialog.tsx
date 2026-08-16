"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Loader2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCookie } from "@/src/lib/get-cookie";
import { SERVICES } from "@/src/lib/services";

const AGENT_API = SERVICES.agent;

type RepoStatus = {
  repo: string;
  changedFiles?: number;
  files?: string[];
  error?: string;
};

type PrInfo = {
  repos: string[];
  hasGithub: boolean;
  suggested: { branch: string; title: string; body: string };
  status: RepoStatus[];
};

type PrResult = {
  repo: string;
  url?: string;
  branch?: string;
  error?: string;
};

export function CreatePrDialog({
  chatId,
  onClose,
}: {
  chatId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PrInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [branch, setBranch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<PrResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getCookie("authorization") ?? "";
        const res = await axios.post<PrInfo>(`${AGENT_API}/chat/pr-info`, {
          authorization: `Bearer ${token}`,
          chat_id: chatId,
        });
        if (cancelled) return;
        const data = res.data;
        setInfo(data);
        setSelected(new Set(data.repos));
        setBranch(data.suggested.branch);
        setTitle(data.suggested.title);
        setBody(data.suggested.body);
      } catch {
        if (!cancelled) setError("Couldn't load pull request details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const toggleRepo = (repo: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = getCookie("authorization") ?? "";
      const res = await axios.post<{ results: PrResult[] }>(
        `${AGENT_API}/chat/create-pr`,
        {
          authorization: `Bearer ${token}`,
          chat_id: chatId,
          title,
          body,
          branch,
          repos: [...selected],
        },
      );
      setResults(res.data.results ?? []);
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : "Failed to create the pull request.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const statusFor = (repo: string) =>
    info?.status.find((s) => s.repo === repo);

  const canSubmit =
    !submitting && selected.size > 0 && title.trim().length > 0 && !!info?.hasGithub;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <GitPullRequest className="size-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Create pull request</h3>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading changes…
            </div>
          ) : results ? (
            <ul className="flex flex-col gap-3">
              {results.map((r) => (
                <li
                  key={r.repo}
                  className="rounded-lg border border-border/60 p-3 text-sm"
                >
                  <div className="mb-1 font-medium">{r.repo}</div>
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-emerald-500 hover:underline"
                    >
                      <CheckCircle2 className="size-3.5" />
                      View pull request
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <div className="inline-flex items-start gap-1.5 text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>{r.error ?? "Failed"}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-4">
              {!info?.hasGithub && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Connect your GitHub account to open a pull request.
                </div>
              )}

              {info && info.repos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This chat has no repositories associated with it, so there is
                  nothing to open a pull request against.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>Repositories</Label>
                    <div className="flex flex-col gap-1.5">
                      {info?.repos.map((repo) => {
                        const st = statusFor(repo);
                        return (
                          <label
                            key={repo}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border/60 px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(repo)}
                              onChange={() => toggleRepo(repo)}
                              className="size-4 accent-emerald-500"
                            />
                            <span className="font-medium">{repo}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {st?.error
                                ? st.error
                                : st
                                  ? `${st.changedFiles ?? 0} changed`
                                  : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pr-branch">Branch</Label>
                    <Input
                      id="pr-branch"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pr-title">Title</Label>
                    <Input
                      id="pr-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pr-body">Description</Label>
                    <Textarea
                      id="pr-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={6}
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
          {results ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={!canSubmit}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Creating…" : "Create PR"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
