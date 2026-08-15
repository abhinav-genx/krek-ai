import { Router, type Request, type Router as ExpressRouter } from "express";
import {
  BROWSER_PORT,
  ensureBrowserScript,
  startBrowserCmd,
  browserReadyScript,
} from "../../utils/browser-code.js";
import { parseMarker } from "../../utils/editor-code.js";
import { connectOrRecreateSandbox } from "../../utils/connect-sandbox.js";

const browserRouter: ExpressRouter = Router();

// Ensures a Chromium + noVNC stack is installed and running in the given
// sandbox, then returns a noVNC viewer URL (auto-connect, password embedded).
browserRouter.post("/browser", async (req: Request, res) => {
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

    // Install the stack on first use. The apt install is large (Chromium + X),
    // so allow a generous command timeout.
    const ensure = await sandbox.commands.run(ensureBrowserScript(), {
      timeoutMs: 420_000,
    });
    const out = `${ensure.stdout}\n${ensure.stderr}`;

    const password = parseMarker(out, "KREK_PASS");
    const deps = parseMarker(out, "KREK_DEPS");
    const running = parseMarker(out, "KREK_RUNNING");

    if (!password || deps !== "OK") {
      return res.status(500).json({
        message: "Failed to install the browser stack in the sandbox.",
        output: out.slice(-2000),
      });
    }

    // Wait until noVNC is serving before handing back a URL. The wait is bounded
    // by the ready script's own deadline (~90s); the command timeout sits above
    // it so a slow first boot isn't cut short into a 502, and a failed wait is
    // swallowed (best-effort) since the viewer reconnects on its own.
    if (running !== "1") {
      await sandbox.commands.run(startBrowserCmd(password), {
        background: true,
      });
      await sandbox.commands
        .run(browserReadyScript(), { timeoutMs: 105_000 })
        .catch(() => undefined);
    }

    const host = sandbox.getHost(BROWSER_PORT);
    const url = `https://${host}/vnc.html?autoconnect=true&resize=scale&password=${encodeURIComponent(
      password,
    )}`;

    res.json({ url, sandboxId: activeSandboxId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/browser failed:", error);

    res.status(500).json({
      message: "Failed to start the browser in the sandbox.",
      error: message,
    });
  }
});

export { browserRouter };
