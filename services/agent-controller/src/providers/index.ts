import type { Message } from "./openai-compatible.js";
import { chatOpenRouter } from "./open-router.js";

export const chat = async (chats: Message[]): Promise<string> => {
  const model = process.env.OPEN_ROUTER_MODEL;
  const apiKey = process.env.OPEN_ROUTER_API_KEY;

  return chatOpenRouter(chats, model as string, apiKey as string);
};
