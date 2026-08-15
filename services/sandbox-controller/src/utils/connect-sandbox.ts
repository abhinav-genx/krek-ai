import { Sandbox } from "@e2b/code-interpreter";
import { SANDBOX_TIMEOUT_MS } from "./sandbox-config.js";
import { setupWorkspacePyCode } from "./py-codes.js";
import {
  isR2Configured,
  presignGet,
  objectExists,
  workspaceKey,
} from "./r2.js";
import { restoreScript } from "./snapshot-code.js";

const WORKSPACE_DIR = "workspace-krek-ai";
const CRACK_HEAD_REPO_URL =
  process.env.CRACK_HEAD_REPO_URL ??
  "https://github.com/abhinav-genx/crack-head";

const toB64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");

export type ConnectedSandbox = {
  sandbox: Sandbox;
  sandboxId: string;
  recreated: boolean;
};

// Connect to an existing sandbox and refresh its lifetime. If it has already
// expired (E2B reclaims idle sandboxes, so `connect` throws for older chats),
// transparently create a fresh one with the workspace scaffolded so opening the
// editor/browser on a previous chat still works instead of failing. Returns the
// (possibly new) sandboxId so the caller can re-bind it to the chat.
export const connectOrRecreateSandbox = async (
  sandboxId: string,
  chatId?: string,
): Promise<ConnectedSandbox> => {
  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
    return { sandbox, sandboxId, recreated: false };
  } catch {
    // Expired or unknown -> spin up a fresh sandbox. (E2B_API_KEY is read from
    // the environment.)
    const sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS });
    // Restore the chat's last workspace snapshot from R2 (if any) before
    // scaffolding, so an expired chat reopens with its files intact.
    if (
      chatId &&
      isR2Configured() &&
      (await objectExists(workspaceKey(chatId)))
    ) {
      const url = await presignGet(workspaceKey(chatId));
      await sandbox.commands
        .run(restoreScript(toB64(url)), { timeoutMs: 120_000 })
        .catch(() => undefined);
    }
    // Rebuild crack-head (its node_modules/dist are gitignored out of snapshots)
    // and scaffold an empty workspace when there was nothing to restore.
    await sandbox
      .runCode(
        setupWorkspacePyCode({
          crackHeadRepoUrl: CRACK_HEAD_REPO_URL,
          repos: [],
          workspaceDir: WORKSPACE_DIR,
        }),
      )
      .catch(() => undefined);
    return { sandbox, sandboxId: sandbox.sandboxId, recreated: true };
  }
};
