import { Router, type Request, type Router as ExpressRouter } from "express";
import { Sandbox } from "@e2b/code-interpreter";
import { setupWorkspacePyCode } from "../../utils/py-codes.js";
import { renderExecution } from "../../utils/render-execution.js";
import { SANDBOX_TIMEOUT_MS } from "../../utils/sandbox-config.js";

const WORKSPACE_DIR = "workspace-krek-ai";
const CRACK_HEAD_REPO_URL =
  process.env.CRACK_HEAD_REPO_URL ??
  "https://github.com/abhinav-genx/crack-head";

const E2B_API_KEY = process.env.E2B_API_KEY;
if (!E2B_API_KEY) throw new Error("E2B_API_KEY is required");

const initRouter: ExpressRouter = Router();

initRouter.post("/create", async (req: Request, res) => {
  const {
    repos: reposInput,
    githubToken,
  }: { repos?: unknown; githubToken?: unknown } = req.body ?? {};

  const repos = Array.isArray(reposInput)
    ? reposInput.filter(
        (repo): repo is string =>
          typeof repo === "string" && repo.trim() !== "",
      )
    : [];

  const token =
    typeof githubToken === "string" && githubToken.length > 0
      ? githubToken
      : undefined;

  try {
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });

    const execution = await sandbox.runCode(
      setupWorkspacePyCode({
        crackHeadRepoUrl: CRACK_HEAD_REPO_URL,
        repos,
        workspaceDir: WORKSPACE_DIR,
        ...(token ? { githubToken: token } : {}),
      }),
    );

    res.json({
      sandboxId: sandbox.sandboxId,
      workspace: WORKSPACE_DIR,
      repos,
      output: renderExecution(execution),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/create failed:", error);

    res.status(500).json({
      message: "Failed to create sandbox or set up the workspace.",
      error: message,
    });
  }
});

export { initRouter };
