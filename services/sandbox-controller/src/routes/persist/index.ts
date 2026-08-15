import { Router, type Request, type Router as ExpressRouter } from "express";
import { Sandbox } from "@e2b/code-interpreter";
import { isR2Configured, presignPut, workspaceKey } from "../../utils/r2.js";
import { snapshotScript } from "../../utils/snapshot-code.js";

const persistRouter: ExpressRouter = Router();

const toB64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");

// Snapshot a chat's workspace to R2. Called after each agent run finishes so the
// latest work is durably stored before the sandbox is ever paused/reclaimed.
persistRouter.post("/snapshot", async (req: Request, res) => {
  const { sandboxId, chatId } = req.body ?? {};

  if (
    typeof sandboxId !== "string" ||
    sandboxId.trim() === "" ||
    typeof chatId !== "string" ||
    chatId.trim() === ""
  ) {
    return res.status(400).json({ error: "sandboxId and chatId are required" });
  }

  if (!isR2Configured()) {
    return res.json({ ok: false, skipped: true, reason: "R2 not configured" });
  }

  try {
    const sandbox = await Sandbox.connect(sandboxId);
    const url = await presignPut(workspaceKey(chatId));
    const out = await sandbox.commands.run(snapshotScript(toB64(url)), {
      timeoutMs: 120_000,
    });
    const combined = `${out.stdout}\n${out.stderr}`;
    return res.json({
      ok: combined.includes("KREK_SNAPSHOT=ok"),
      empty: combined.includes("KREK_SNAPSHOT=nodir"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/snapshot failed:", message);
    return res.status(500).json({ error: "snapshot failed", message });
  }
});

export { persistRouter };
