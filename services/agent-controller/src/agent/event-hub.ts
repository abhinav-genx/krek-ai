import { EventEmitter } from "node:events";

// One line of live agent activity streamed to the browser over SSE.
// `status` is terminal ("done" | "error") and tells the client the run ended.
export type AgentStreamEvent = {
  channel: "parent" | "swarm" | "system" | "error" | "status";
  message: string;
  ts: number;
};

type Hub = {
  emitter: EventEmitter;
  buffer: AgentStreamEvent[];
  done: boolean;
};

// Keep the tail of events so a browser that connects a beat after the agent
// starts (or briefly reconnects) still replays everything from the top.
const MAX_BUFFER = 500;
// How long a finished hub lingers so late/reconnecting clients can still replay
// the tail before it's freed.
const DONE_TTL_MS = 60_000;

// chatId -> hub. In-memory: live activity is ephemeral; the final result is
// persisted to the DB by the caller.
const hubs = new Map<string, Hub>();

// Start (or reset) the hub for a chat. Call this before wiring agent events so
// nothing emitted during the run is lost.
export const createHub = (chatId: string): Hub => {
  const existing = hubs.get(chatId);
  if (existing) {
    existing.buffer = [];
    existing.done = false;
    return existing;
  }
  const hub: Hub = { emitter: new EventEmitter(), buffer: [], done: false };
  hub.emitter.setMaxListeners(0); // one listener per connected browser
  hubs.set(chatId, hub);
  return hub;
};

export const getHub = (chatId: string): Hub | undefined => hubs.get(chatId);

// Buffer + fan out a single event to every connected browser.
export const publish = (
  chatId: string,
  channel: AgentStreamEvent["channel"],
  message: string,
): void => {
  const hub = hubs.get(chatId);
  if (!hub) return;
  const event: AgentStreamEvent = { channel, message, ts: Date.now() };
  hub.buffer.push(event);
  if (hub.buffer.length > MAX_BUFFER) hub.buffer.shift();
  hub.emitter.emit("event", event);
};

// Emit the terminal status, flag the hub done (new connections close right
// away), and schedule cleanup.
export const closeHub = (chatId: string, status: "done" | "error"): void => {
  const hub = hubs.get(chatId);
  if (!hub) return;
  publish(chatId, "status", status);
  hub.done = true;
  hub.emitter.emit("done");
  setTimeout(() => {
    const current = hubs.get(chatId);
    if (current && current.done) hubs.delete(chatId);
  }, DONE_TTL_MS);
};
