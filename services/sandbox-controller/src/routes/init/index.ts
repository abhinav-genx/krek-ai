import { Router, type Request, type Router as ExpressRouter } from "express";
import { Sandbox } from "@e2b/code-interpreter";

const initRouter: ExpressRouter = Router();

initRouter.get("/create", async (req: Request, res) => {
  const repoUrl =
    typeof req.query.repoUrl === "string" ? req.query.repoUrl : undefined;

  if (!repoUrl) {
    res.status(400).json({
      message: "Missing required repoUrl query parameter.",
    });
    return;
  }

  try {
    const sandbox = await Sandbox.create({ apiKey: "e2b_4ffee0eebe25318329d3c83669dbd7283008add8" });
    const execution = await sandbox.runCode(`
import subprocess

result = subprocess.run(
    ["git", "clone", "--depth", "1", ${JSON.stringify(repoUrl)}, "/tmp/repo"],
    capture_output=True,
    text=True,
)

print(result.stdout)
print(result.stderr)
print(f"exit_code={result.returncode}")
`);

    res.json({
      sandboxId: sandbox.sandboxId,
      output: execution.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    res.status(500).json({
      message: "Failed to create sandbox or clone repository.",
      error: message,
    });
  }
});

export { initRouter };
