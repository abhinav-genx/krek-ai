import { Router, type Request, type Router as ExpressRouter } from "express";
import { Sandbox } from "@e2b/code-interpreter";
import { crackHeadRunnerPyCode } from "../../utils/py-codes.js";
import { renderExecution } from "../../utils/render-execution.js";

const usetoolRouter: ExpressRouter = Router();

usetoolRouter.post("/use-tools", async (req: Request, res) => {
  // add check to ensure if the sandbox belongs to that user or not
  const { toolsXml, sandboxId } = req.body ?? {};

  try {
    const sandbox = await Sandbox.connect(sandboxId);
    const execution = await sandbox.runCode(
      crackHeadRunnerPyCode(toolsXml),
    );

    res.json({
      sandboxId: sandbox.sandboxId,
      output: renderExecution(execution),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sandbox-controller] /sandbox/use-tools failed:", error);

    res.status(500).json({
      message: "Failed to run tools in the sandbox.",
      error: message,
    });
  }
});

export { usetoolRouter };
