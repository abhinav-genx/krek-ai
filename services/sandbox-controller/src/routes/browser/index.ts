import { Router, type Request, type Router as ExpressRouter } from "express";
import {
  ensureBrowserScript,
  startBrowserCmd,
  browserReadyScript,
} from "../../utils/browser-code.js";
import { parseMarker } from "../../utils/editor-code.js";
import { connectOrRecreateSandbox } from "../../utils/connect-sandbox.js";

const browserRouter: ExpressRouter = Router();

// Ensures a headless Chromium + CDP viewer is installed and running in the given
// sandbox, then returns the viewer URL. The viewer streams the page over the
// Chrome DevTools Protocol (no VNC), and the port is chosen dynamically inside
// the sandbox rather than a fixed 6080.
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

    // Install Chromium on first use, write the viewer/server, and allocate the
    // port. The apt install is large, so allow a generous command timeout.
    const ensure = await sandbox.commands.run(ensureBrowserScript(), {
      timeoutMs: 420_000,
    });
    const out = `${ensure.stdout}\n${ensure.stderr}`;

    const deps = parseMarker(out, "KREK_DEPS");
    const portStr = parseMarker(out, "KREK_PORT");
    const running = parseMarker(out, "KREK_RUNNING");
    const port = Number(portStr);

    if (deps !== "OK" || !Number.isFinite(port) || port <= 0) {
      return res.status(500).json({
        message: "Failed to install the virtual browser stack in the sandbox.",
        output: out.slice(-2000),
      });
    }

    // Wait until the viewer server is serving before handing back a URL. The
    // wait is bounded by the ready script's own deadline (~75s); the command
    // timeout sits above it so a slow first boot isn't cut short into a 502, and
    // a failed wait is swallowed (best-effort) since the viewer reconnects.
    if (running !== "1") {
      await sandbox.commands.run(startBrowserCmd(), {
        background: true,
      });
      await sandbox.commands
        .run(browserReadyScript(port), { timeoutMs: 105_000 })
        .catch(() => undefined);
    }

    const host = sandbox.getHost(port);
    const url = `https://${host}/`;

    res.json({ url, sandboxId: activeSandboxId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/browser failed:", error);

    res.status(500).json({
      message: "Failed to start the virtual browser in the sandbox.",
      error: message,
    });
  }
});

export { browserRouter };
