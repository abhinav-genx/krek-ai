import { EventEmitter } from "node:events";
import { chat } from "../providers/index.js";
import { getAgentSystemprompt, getAgentprompt } from "../prompts.js";
import { executeTools, formatAvailableToolsXml } from "../tools/index.js";
import { extractAllXmlContent, extractXmlContent } from "../utils/xml-utils.js";
import type { Message } from "../providers/openai-compatible.js";
import { executeAgentSwarm, formatSwarmEvent } from "./execute-agent-swarm.js";
import { getFinishMessage } from "../tools/finish.js";

// Hard caps so a model that keeps calling tools without ever calling finish
// can't loop forever (and can't wedge the swarm that awaits it).
const MAX_ITERATIONS = 25;
const MAX_TOOL_REPEATS = 3;
const MAX_SWARM_REPEATS = 2;

export enum AGENT_TYPE {
  AGENT,
  SUB_AGENT,
}

export class Agent extends EventEmitter {
  name: string;
  pending_commands: string[];
  pending_tool_call: string[];
  conversations: Message[];
  stop_loop_signal: boolean;
  loop_running: boolean;
  latest_tool_output: string;
  latest_summary: string;
  current_task: string;
  latest_sub_agents_response: string;
  result: string;
  type: AGENT_TYPE;
  sandboxId: string;

  constructor(
    type: AGENT_TYPE = AGENT_TYPE.AGENT,
    conversations: Message[] = [],
    sandboxId: string = "",
  ) {
    super();
    this.name = "";
    this.pending_commands = [];
    this.pending_tool_call = [];
    this.conversations = [];
    // NOTE: an empty array is truthy, so check length — otherwise the system
    // prompt (which defines the tool protocol) is never seeded.
    conversations.length > 0
      ? (this.conversations = conversations)
      : this.conversations.push({
          role: "system",
          content: getAgentSystemprompt(formatAvailableToolsXml()),
        });
    this.sandboxId = sandboxId;
    this.stop_loop_signal = false;
    this.loop_running = false;
    this.latest_tool_output = "";
    this.latest_summary = "";
    this.current_task = "";
    this.latest_sub_agents_response = "";
    this.result = "";
    this.type = type;
  }

  stopLoop = () => {
    this.stop_loop_signal = true;
    this.latest_tool_output = "";
    this.latest_summary = "";
    this.current_task = "";
    this.latest_sub_agents_response = "";
    this.result = "";
  };

  // Ends the run: records the outcome, surfaces it on the agent's channel, and
  // clears the per-iteration state so the while-loop condition goes falsy.
  endRun = (message: string) => {
    this.result = message;
    this.emit(
      this.type == AGENT_TYPE.AGENT ? "parent" : "swarm",
      `> ${message}`,
    );
    this.latest_tool_output = "";
    this.current_task = "";
    this.latest_sub_agents_response = "";
  };

  pushCommand = (command: string) => {
    if (!command || command.length == 0) return;
    this.pending_commands.push(command);
  };

  // Seed the agent with a prior conversation so a resumed run keeps its context.
  // The fresh system prompt stays at index 0; only user/assistant turns are added.
  seedConversation = (messages: Message[]) => {
    for (const message of messages) {
      if (message.role !== "system") this.conversations.push(message);
    }
  };

  executeNextCommand = async () => {
    const continuing =
      this.latest_tool_output.length > 0 ||
      this.latest_sub_agents_response.length > 0;

    const nextCommand = continuing ? undefined : this.pending_commands.shift();

    if (!nextCommand && !continuing) return;
    if (nextCommand) this.current_task = nextCommand;

    const finalprompt = getAgentprompt(
      this.current_task,
      this.latest_tool_output,
      this.latest_summary,
      this.latest_sub_agents_response,
    );

    this.latest_tool_output = "";
    this.latest_sub_agents_response = "";

    this.conversations.push({
      role: "user",
      content: finalprompt as string,
    });
    this.emit("updated-conversations", this.conversations);

    const response = await chat(this.conversations);

    this.conversations.push({
      role: "assistant",
      content: response as string,
    });
    this.emit("updated-conversations", this.conversations);
    return response;
  };

  loop = async () => {
    if (this.loop_running) return;
    this.loop_running = true;

    let iterations = 0;
    let last_tools_signature = "";
    let repeat_count = 0;
    let last_swarm_signature = "";
    let swarm_repeat_count = 0;

    const label = this.type == AGENT_TYPE.AGENT ? "agent" : "sub-agent";
    console.log(
      `[${label}] loop start -> task: ${(
        this.current_task ||
        this.pending_commands[0] ||
        ""
      ).slice(0, 120)}`,
    );

    try {
      while (
        this.pending_commands.length > 0 ||
        this.latest_tool_output.length > 0 ||
        this.latest_sub_agents_response.length > 0
      ) {
        if (this.stop_loop_signal) {
          this.stop_loop_signal = false;
          break;
        }

        if (++iterations > MAX_ITERATIONS) {
          this.endRun(
            `Stopped after ${MAX_ITERATIONS} iterations without calling finish — aborting to avoid an infinite loop.`,
          );
          break;
        }

        const response = await this.executeNextCommand();

        const tools_to_use = extractXmlContent(
          "TOOLS_TO_USE",
          response as string,
        );

        console.log(
          `[${label}] iteration ${iterations} -> model replied ${
            (response as string | undefined)?.length ?? 0
          } chars; tools=${tools_to_use && tools_to_use.trim() ? "yes" : "none"}`,
        );
        if (!tools_to_use || !tools_to_use.trim()) {
          console.log(
            `[${label}] raw response:\n${((response as string) ?? "").slice(0, 600)}`,
          );
        }

        // Repetition guard: a model stuck re-issuing the same tool call (and
        // never calling finish) keeps latest_tool_output non-empty and would
        // loop forever. Bail after MAX_TOOL_REPEATS identical calls in a row.
        const tools_signature = (tools_to_use ?? "").trim();
        if (
          tools_signature.length > 0 &&
          tools_signature === last_tools_signature
        ) {
          repeat_count++;
        } else {
          repeat_count = 1;
          last_tools_signature = tools_signature;
        }
        if (repeat_count >= MAX_TOOL_REPEATS) {
          this.endRun(
            `Stopped: the same tool call was repeated ${repeat_count} times without finishing.`,
          );
          break;
        }

        const summary = extractXmlContent("SUMMARY", response as string);

        const chat_response = extractXmlContent("RESPONSE", response as string);

        if (chat_response && chat_response.trim().length > 0) {
          this.emit(
            `${this.type == AGENT_TYPE.AGENT ? "parent" : "swarm"}`,
            `> ${chat_response}`,
          );
        }

        const sub_agents_str = extractXmlContent(
          "CREATE_SUB_AGENTS",
          response as string,
        );

        const sub_agents = extractAllXmlContent(
          "AGENT",
          sub_agents_str as string,
        );

        this.latest_summary = summary as string;

        // Only dispatch a swarm when the model actually requested sub-agents;
        // otherwise latest_sub_agents_response must stay "" so the loop can end.
        if (sub_agents.length > 0) {
          // Guard against a model that keeps re-spawning the same sub-agent set
          // (instead of calling finish) — it would loop until MAX_ITERATIONS.
          const swarm_signature = (sub_agents_str ?? "").trim();
          if (swarm_signature === last_swarm_signature) {
            swarm_repeat_count++;
          } else {
            swarm_repeat_count = 1;
            last_swarm_signature = swarm_signature;
          }
          if (swarm_repeat_count >= MAX_SWARM_REPEATS) {
            this.endRun(
              `Stopped: the same sub-agent swarm was dispatched ${swarm_repeat_count} times without finishing.`,
            );
            break;
          }

          this.emit("system", "Spawnning agents :");

          const sub_agents_response = await executeAgentSwarm(
            sub_agents,
            this.sandboxId,
            (event) => this.emit("system", `> ${formatSwarmEvent(event)}`),
          );
          this.latest_sub_agents_response = sub_agents_response
            .map(
              (r, i) =>
                `<AGENT_RESPONSE index="${i + 1}"><![CDATA[\n${r}\n]]></AGENT_RESPONSE>`,
            )
            .join("\n");
        }

        try {
          if (tools_to_use && tools_to_use.trim().length > 0) {
            console.log(
              `[${label}] executing tools in sandbox ${this.sandboxId}`,
            );
            const tools_output = await executeTools(tools_to_use, this.sandboxId);
            this.latest_tool_output = tools_output;

            const finish_message = getFinishMessage(tools_to_use);
            if (finish_message !== null) {
              this.endRun(
                finish_message.trim().length > 0
                  ? finish_message
                  : "Task complete.",
              );
              break;
            }
          }
        } catch (err) {
          this.latest_tool_output = `<TOOL_OUTPUT>
<TOOL_NAME>unknown</TOOL_NAME>
<OUTPUT><![CDATA[
ERROR: ${err instanceof Error ? err.message : String(err)}
]]></OUTPUT>
</TOOL_OUTPUT>`;
        }
      }
    } catch (err) {
      this.emit("error", err);
      this.loop_running = false;
    } finally {
      this.loop_running = false;
    }
    this.loop_running = false;
    console.log(
      `[${label}] loop ended after ${iterations} iteration(s) -> ${
        this.result
          ? `result: ${this.result.slice(0, 200)}`
          : "no finish() called / nothing to do"
      }`,
    );
  };
}
