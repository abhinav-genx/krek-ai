import { Router, type Request, type Router as ExpressRouter } from "express";
import {
  EDITOR_PORT,
  ensureEditorScript,
  startEditorCmd,
  editorReadyScript,
  parseMarker,
} from "../../utils/editor-code.js";
import { connectOrRecreateSandbox } from "../../utils/connect-sandbox.js";

const editorRouter: ExpressRouter = Router();

// Ensures code-server (VS Code + integrated shell) is installed and running in
// the given sandbox, then returns its public URL and one-time login password.
editorRouter.post("/editor", async (req: Request, res) => {
  const { sandboxId, chatId } = req.body ?? {};

  if (typeof sandboxId !== "string" || sandboxId.trim() === "") {
    return res.status(400).json({ error: "sandboxId is required" });
  }

  try {
    // Reconnect (refreshing the lifetime) or, if it expired, recreate it —
    // restoring the chat's R2 snapshot — so an old chat still opens with its
    // files. `activeSandboxId` may differ from the requested one.
    const { sandbox, sandboxId: activeSandboxId } =
      await connectOrRecreateSandbox(
        sandboxId,
        typeof chatId === "string" && chatId ? chatId : undefined,
      );

    // Install (first time only) + create the password file. The curl|sh install
    // can take a while, so allow a generous command timeout. Run as root: the
    // agent's runCode kernel writes the workspace to /root/workspace-krek-ai,
    // which the default "user" can't access — so code-server must be root too.
    const ensure = await sandbox.commands.run(ensureEditorScript(), {
      user: "root",
      timeoutMs: 300_000,
    });
    const out = `${ensure.stdout}\n${ensure.stderr}`;

    const bin = parseMarker(out, "KREK_BIN");
    const running = parseMarker(out, "KREK_RUNNING");

    if (!bin || bin === "MISSING") {
      return res.status(500).json({
        message: "Failed to install code-server in the sandbox.",
        output: out.slice(-2000),
      });
    }

    // Start the server in the background (only if it isn't already up) and wait
    // for it to accept connections before handing back a URL. The wait is bounded
    // by the ready script's own deadline (~60s); the command timeout sits above
    // it so a slow-but-eventually-ready start isn't cut short into a 502, and a
    // failed wait is swallowed (best-effort) since the frame reconnects anyway.
    if (running !== "1") {
      await sandbox.commands.run(startEditorCmd(), {
        user: "root",
        background: true,
      });
      await sandbox.commands
        .run(editorReadyScript(), { user: "root", timeoutMs: 75_000 })
        .catch(() => undefined);
    }

    const url = `https://${sandbox.getHost(EDITOR_PORT)}`;

    res.json({ url, sandboxId: activeSandboxId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/editor failed:", error);

    res.status(500).json({
      message: "Failed to start the editor in the sandbox.",
      error: message,
    });
  }
});

export { editorRouter };
