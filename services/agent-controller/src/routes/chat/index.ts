import { Router, type Router as ExpressRouter } from "express";
import { requireUserDetails } from "../../middlewares/require-user-details.js";
import { Agent, AGENT_TYPE } from "../../agent/parent.js";
import { prisma } from "@krek-ai/db";
import { decryptToken } from "../../lib/decrypt-token.js";
import type { Message } from "../../providers/openai-compatible.js";
import { createHub, getHub, publish, closeHub } from "../../agent/event-hub.js";
import type { AgentStreamEvent } from "../../agent/event-hub.js";
import axios from "axios";

const chatRouter: ExpressRouter = Router();

// Shared secret so only trusted services can drive the sandbox-controller.
const internalHeaders = () => ({
  "x-internal-key": process.env.INTERNAL_API_KEY ?? "",
});

// Best-effort lookup of the user's decrypted GitHub token (undefined if not
// connected or the key isn't configured) — used to clone private repos.
const getGithubToken = async (
  userId: string,
): Promise<string | undefined> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { github_access_token_encrypted: true },
  });
  if (!user?.github_access_token_encrypted) return undefined;
  return decryptToken(user.github_access_token_encrypted) ?? undefined;
};

// Persist the chat's workspace to R2 after a run so its files survive the
// sandbox being paused/reclaimed. Best-effort — never fails the run.
const snapshotWorkspace = async (
  sandboxId: string,
  chatId: string,
): Promise<void> => {
  try {
    await axios.post(
      `${process.env.SANDBOX_CONTROLLER_URL}/sandbox/snapshot`,
      { sandboxId, chatId },
      { headers: internalHeaders() },
    );
  } catch (err) {
    console.error(
      "[SNAPSHOT ERROR] :",
      err instanceof Error ? err.message : String(err),
    );
  }
};

// Runs the agent to completion, then persists its result + final status.
// Fire-and-forget from the request handler.
const runAgent = async (
  agentX: Agent,
  chatId: string,
  sandboxId: string,
): Promise<void> => {
  // Collect the full activity trace (with timestamps) so it can be persisted
  // and replayed on reload. The latest "parent" line doubles as the answer when
  // the model never calls finish.
  const trace: { channel: string; content: string; ts: number }[] = [];
  let latestResponse = "";
  const record =
    (channel: "parent" | "swarm" | "system") => (msg: string) => {
      const clean = msg.replace(/^>\s*/, "");
      trace.push({ channel, content: clean, ts: Date.now() });
      if (channel === "parent" && clean.trim()) latestResponse = clean.trim();
    };
  agentX.on("parent", record("parent"));
  agentX.on("swarm", record("swarm"));
  agentX.on("system", record("system"));
  agentX.on("error", (err: unknown) => {
    trace.push({
      channel: "error",
      content: err instanceof Error ? err.message : String(err),
      ts: Date.now(),
    });
  });

  const persistTrace = async () => {
    if (trace.length === 0) return;
    await prisma.chatEvent
      .createMany({
        data: trace.map((e) => ({
          chatId,
          channel: e.channel,
          content: e.content,
          createdAt: new Date(e.ts),
        })),
      })
      .catch((err: unknown) => console.error("[PERSIST TRACE ERROR] :", err));
  };

  try {
    await agentX.loop();
    await persistTrace();
    const result = agentX.result.trim() || latestResponse;
    if (result.length > 0) {
      await prisma.message.create({
        data: { chatId, role: "assistant", content: result },
      });
    }
    await prisma.chat.update({
      where: { id: chatId },
      data: { status: "done", result: result || null },
    });
    closeHub(chatId, "done");
    await snapshotWorkspace(sandboxId, chatId);
  } catch (err) {
    console.error("[AGENT LOOP ERROR] :", err);
    await persistTrace();
    await prisma.chat
      .update({
        where: { id: chatId },
        data: {
          status: "error",
          result: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    closeHub(chatId, "error");
    await snapshotWorkspace(sandboxId, chatId);
  }
};

chatRouter.post("/chat", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;
  const { user_prompt, chat_id, repos } = req.body ?? {};

  if (typeof user_prompt !== "string" || user_prompt.trim().length === 0) {
    return res.status(400).json({ error: "user_prompt is required" });
  }

  const selectedRepos: string[] = Array.isArray(repos)
    ? repos.filter(
        (r): r is string => typeof r === "string" && r.trim() !== "",
      )
    : [];

  try {
    let sandboxId = "";
    let chatId_db = "";
    let priorMessages: Message[] = [];

    if (!chat_id) {
      // Only fetch the GitHub token when we actually need to clone repos.
      const githubToken =
        selectedRepos.length > 0 ? await getGithubToken(userId) : undefined;

      const res_sandbox_controller = await axios.post(
        `${process.env.SANDBOX_CONTROLLER_URL}/sandbox/create`,
        {
          repos: selectedRepos,
          ...(githubToken ? { githubToken } : {}),
        },
        { headers: internalHeaders() },
      );

      sandboxId = res_sandbox_controller.data.sandboxId;

      const new_chat = await prisma.chat.create({
        data: {
          userId,
          sandboxId,
          title: user_prompt.trim().slice(0, 80),
          status: "running",
        },
      });
      chatId_db = new_chat.id;
    } else {
      chatId_db = chat_id;
      const existing_chat = await prisma.chat.findUnique({
        where: { id: chatId_db },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!existing_chat || existing_chat.userId !== userId) {
        return res.status(404).json({ error: "Chat not found" });
      }

      sandboxId = existing_chat.sandboxId;
      // Seed the agent with prior turns so a resumed chat keeps its context.
      priorMessages = existing_chat.messages.map((m) => ({
        role: m.role as Message["role"],
        content: m.content,
      }));
      await prisma.chat.update({
        where: { id: chatId_db },
        data: { status: "running" },
      });
    }

    // Persist the user's message for history + display.
    await prisma.message.create({
      data: { chatId: chatId_db, role: "user", content: user_prompt },
    });

    const agentX = new Agent(AGENT_TYPE.AGENT, [], sandboxId);
    if (priorMessages.length > 0) agentX.seedConversation(priorMessages);

    // Open the live activity stream before wiring events so nothing the agent
    // emits during the run is lost, then forward each channel to the browser.
    createHub(chatId_db);
    agentX.on("parent", (msg: string) => {
      console.log(`[PARENT] : ${msg}`);
      publish(chatId_db, "parent", msg);
    });
    agentX.on("swarm", (msg: string) => {
      console.log(`[SWARM] : ${msg}`);
      publish(chatId_db, "swarm", msg);
    });
    agentX.on("system", (msg: string) => {
      console.log(`[SYSTEM] : ${msg}`);
      publish(chatId_db, "system", msg);
    });
    agentX.on("error", (err: unknown) => {
      console.error(`[AGENT ERROR] :`, err);
      publish(chatId_db, "error", err instanceof Error ? err.message : String(err));
    });
    agentX.pushCommand(user_prompt);

    // Respond right away so the client + sidebar update immediately; the agent
    // keeps running server-side and its result is persisted when it finishes.
    res.status(201).json({ chatId: chatId_db, sandboxId });

    void runAgent(agentX, chatId_db, sandboxId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /chat failed:", message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to start chat" });
    }
  }
});

// Live agent activity for a chat over Server-Sent Events. EventSource can't set
// headers, so the JWT is passed as ?authorization=... (requireUserDetails also
// reads it from the query).
chatRouter.get("/chat/:chatId/stream", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;
  const chatIdParam = req.params.chatId;
  const chatId = Array.isArray(chatIdParam) ? chatIdParam[0] : chatIdParam;
  if (!chatId) return res.status(400).json({ error: "chatId is required" });

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { userId: true, status: true },
  });
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: "Chat not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":\n\n"); // open the stream

  const send = (event: AgentStreamEvent) =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);

  const hub = getHub(chatId);

  // No live hub -> this run already finished (or never started in this
  // process). Tell the client the final state so it can load persisted history.
  if (!hub) {
    send({
      channel: "status",
      message: chat.status === "error" ? "error" : "done",
      ts: Date.now(),
    });
    return res.end();
  }

  // Replay everything buffered so far, then follow live. There's no await
  // between the snapshot and subscribe, so no event can slip through the gap.
  for (const event of hub.buffer) send(event);
  if (hub.done) return res.end();

  let ended = false;
  const cleanup = (end: boolean) => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    hub.emitter.off("event", onEvent);
    hub.emitter.off("done", onDone);
    if (end) res.end();
  };
  const onEvent = (event: AgentStreamEvent) => send(event);
  const onDone = () => cleanup(true);
  const heartbeat = setInterval(() => res.write(":\n\n"), 15_000);

  hub.emitter.on("event", onEvent);
  hub.emitter.on("done", onDone);
  req.on("close", () => cleanup(false));
});

chatRouter.post("/chats", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;

  const chats = await prisma.chat.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  return res.json({ chats });
});

// Detail for one chat: status, result, and message history (for polling/display).
chatRouter.post("/chat-detail", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;
  const { chat_id } = req.body ?? {};

  if (typeof chat_id !== "string" || chat_id.length === 0) {
    return res.status(400).json({ error: "chat_id is required" });
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chat_id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { id: "asc" } },
    },
  });

  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: "Chat not found" });
  }

  return res.json({
    chat: {
      id: chat.id,
      title: chat.title,
      status: chat.status,
      result: chat.result,
      sandboxId: chat.sandboxId,
      createdAt: chat.createdAt,
    },
    messages: chat.messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    events: chat.events.map((e) => ({
      channel: e.channel,
      content: e.content,
      createdAt: e.createdAt,
    })),
  });
});

// Starts (or reuses) the in-sandbox code-server editor for a chat and returns
// its public URL + one-time login password. Only the chat's owner may open it.
chatRouter.post("/chat/editor", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;
  const { chat_id } = req.body ?? {};

  if (typeof chat_id !== "string" || chat_id.length === 0) {
    return res.status(400).json({ error: "chat_id is required" });
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chat_id },
    select: { userId: true, sandboxId: true },
  });

  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: "Chat not found" });
  }

  try {
    const r = await axios.post(
      `${process.env.SANDBOX_CONTROLLER_URL}/sandbox/editor`,
      { sandboxId: chat.sandboxId, chatId: chat_id },
      { headers: internalHeaders() },
    );
    // The sandbox may have been recreated (expired) — persist the new id so the
    // chat, its browser pane, and any resume all reuse the live sandbox.
    const activeSandboxId: string | undefined = r.data?.sandboxId;
    if (activeSandboxId && activeSandboxId !== chat.sandboxId) {
      await prisma.chat
        .update({ where: { id: chat_id }, data: { sandboxId: activeSandboxId } })
        .catch(() => {});
    }
    return res.json({ url: r.data.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /chat/editor failed:", message);
    return res.status(502).json({ error: "Failed to start editor" });
  }
});

// Starts (or reuses) the in-sandbox Chromium + noVNC browser for a chat and
// returns its viewer URL. Only the chat's owner may open it.
chatRouter.post("/chat/browser", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;
  const { chat_id } = req.body ?? {};

  if (typeof chat_id !== "string" || chat_id.length === 0) {
    return res.status(400).json({ error: "chat_id is required" });
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chat_id },
    select: { userId: true, sandboxId: true },
  });

  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: "Chat not found" });
  }

  try {
    const r = await axios.post(
      `${process.env.SANDBOX_CONTROLLER_URL}/sandbox/browser`,
      { sandboxId: chat.sandboxId, chatId: chat_id },
      { headers: internalHeaders() },
    );
    // The sandbox may have been recreated (expired) — persist the new id so the
    // chat, its editor pane, and any resume all reuse the live sandbox.
    const activeSandboxId: string | undefined = r.data?.sandboxId;
    if (activeSandboxId && activeSandboxId !== chat.sandboxId) {
      await prisma.chat
        .update({ where: { id: chat_id }, data: { sandboxId: activeSandboxId } })
        .catch(() => {});
    }
    return res.json({ url: r.data.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /chat/browser failed:", message);
    return res.status(502).json({ error: "Failed to start browser" });
  }
});

export { chatRouter };
