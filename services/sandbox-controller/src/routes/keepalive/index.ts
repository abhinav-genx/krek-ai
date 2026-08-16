import { Router, type Request, type Router as ExpressRouter } from "express";
import { Sandbox } from "@e2b/code-interpreter";
import { SANDBOX_TIMEOUT_MS } from "../../utils/sandbox-config.js";

const keepaliveRouter: ExpressRouter = Router();

// Lightweight keep-alive: the sandbox lifetime is an ABSOLUTE timer (E2B kills
// it ~SANDBOX_TIMEOUT_MS after the last refresh, not on idle). While an editor
// or browser pane sits open, nothing else refreshes it, so the sandbox is
// reclaimed mid-session and both panes disconnect. The frontend pings this
// endpoint on an interval to push the timer forward. Unlike /editor and
// /browser it only connects + setTimeout — no install/ready scripts — so it's
// cheap enough to call frequently. If the sandbox has already expired we do NOT
// recreate it here (that's the pane routes' job); we just report it so the
// caller can stop pinging.
keepaliveRouter.post("/keepalive", async (req: Request, res) => {
  const { sandboxId } = req.body ?? {};

  if (typeof sandboxId !== "string" || sandboxId.trim() === "") {
    return res.status(400).json({ error: "sandboxId is required" });
  }

  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
    return res.json({ ok: true, sandboxId, timeoutMs: SANDBOX_TIMEOUT_MS });
  } catch {
    // Already expired/unknown — the pane routes will recreate on next open.
    return res.status(410).json({ ok: false, expired: true });
  }
});

export { keepaliveRouter };
