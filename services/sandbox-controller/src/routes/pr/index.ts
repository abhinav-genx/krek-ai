import { Router, type Request, type Router as ExpressRouter } from "express";
import { connectOrRecreateSandbox } from "../../utils/connect-sandbox.js";
import { createPrPyCode, prStatusPyCode } from "../../utils/pr-code.js";

const prRouter: ExpressRouter = Router();

const WORKSPACE_DIR = "workspace-krek-ai";

type PrResult = {
  repo: string;
  url?: string;
  branch?: string;
  error?: string;
};

// Opens a pull request for each repo the agent worked on in the chat's sandbox:
// commits all changes onto a new branch, pushes, and creates the PR via the
// GitHub API. Requires a GitHub token (private pushes) supplied by the caller.
prRouter.post("/create-pr", async (req: Request, res) => {
  const { sandboxId, chatId, repos, branch, title, body, githubToken } =
    req.body ?? {};

  if (typeof sandboxId !== "string" || sandboxId.trim() === "") {
    return res.status(400).json({ error: "sandboxId is required" });
  }
  const repoList: string[] = Array.isArray(repos)
    ? repos.filter((r): r is string => typeof r === "string" && r.trim() !== "")
    : [];
  if (repoList.length === 0) {
    return res.status(400).json({ error: "at least one repo is required" });
  }
  if (typeof githubToken !== "string" || githubToken.trim() === "") {
    return res
      .status(400)
      .json({ error: "githubToken is required to open a pull request" });
  }
  if (typeof branch !== "string" || branch.trim() === "") {
    return res.status(400).json({ error: "branch is required" });
  }
  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "title is required" });
  }

  try {
    // Reconnect (refresh lifetime) or recreate+restore if the sandbox expired so
    // the PR still works on an older chat.
    const { sandbox } = await connectOrRecreateSandbox(
      sandboxId,
      typeof chatId === "string" && chatId ? chatId : undefined,
    );

    // Files live in /root/workspace-krek-ai (agent runCode runs as root).
    const exec = await sandbox.runCode(
      createPrPyCode({
        repos: repoList,
        branch: branch.trim(),
        title: title.trim(),
        body: typeof body === "string" ? body : "",
        githubToken,
        workspaceDir: WORKSPACE_DIR,
      }),
    );

    const stdout = (exec.logs?.stdout ?? []).join("");
    const stderr = (exec.logs?.stderr ?? []).join("");
    const combined = `${stdout}\n${stderr}\n${exec.text ?? ""}`;

    const marker = "KREK_PR_RESULT=";
    const idx = combined.lastIndexOf(marker);
    let results: PrResult[] = [];
    if (idx !== -1) {
      const line = combined.slice(idx + marker.length).split("\n")[0]?.trim();
      try {
        results = JSON.parse(line ?? "{}").results ?? [];
      } catch {
        results = [];
      }
    }

    if (results.length === 0) {
      return res.status(500).json({
        error: "Failed to create pull request",
        output: combined.slice(-1500),
      });
    }

    return res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/create-pr failed:", message);
    return res.status(500).json({ error: "create-pr failed", message });
  }
});

// Preview which files changed per repo so the dialog can show a diff summary.
prRouter.post("/pr-status", async (req: Request, res) => {
  const { sandboxId, chatId, repos } = req.body ?? {};

  if (typeof sandboxId !== "string" || sandboxId.trim() === "") {
    return res.status(400).json({ error: "sandboxId is required" });
  }
  const repoList: string[] = Array.isArray(repos)
    ? repos.filter((r): r is string => typeof r === "string" && r.trim() !== "")
    : [];
  if (repoList.length === 0) {
    return res.json({ repos: [] });
  }

  try {
    const { sandbox } = await connectOrRecreateSandbox(
      sandboxId,
      typeof chatId === "string" && chatId ? chatId : undefined,
    );
    const exec = await sandbox.runCode(
      prStatusPyCode({ repos: repoList, workspaceDir: WORKSPACE_DIR }),
    );
    const combined = `${(exec.logs?.stdout ?? []).join("")}\n${(
      exec.logs?.stderr ?? []
    ).join("")}\n${exec.text ?? ""}`;
    const marker = "KREK_PR_STATUS=";
    const idx = combined.lastIndexOf(marker);
    if (idx === -1) return res.json({ repos: [] });
    const line = combined.slice(idx + marker.length).split("\n")[0]?.trim();
    try {
      return res.json(JSON.parse(line ?? "{}"));
    } catch {
      return res.json({ repos: [] });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/pr-status failed:", message);
    return res.status(500).json({ error: "pr-status failed", message });
  }
});

export { prRouter };
