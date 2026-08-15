import axios from "axios";
import { finishTool } from "./finish.js";

const finish_tool_description = `Signal that the user's task is FULLY complete and has been verified. Calling this ENDS the run.
- Only call finish AFTER you have verified the result (e.g. the build/tests pass, or the file exists).
- Put a concise summary of what you did and how you verified it in <MESSAGE>.
- Do NOT call finish while work remains, and do NOT keep calling other tools once the task is done — call finish instead.

Example input:
<TOOL>
<NAME>finish</NAME>
<MESSAGE><![CDATA[Fixed the off-by-one in multiply() in sandbox/math.ts and ran \`pnpm run dev\` — all 4 assertions pass.]]></MESSAGE>
</TOOL>`;

const list_files_tool_description = `List files and directories under a path, optionally filtered by a glob. Use it to discover project structure or find files by name.
- PATH is the directory to list (default "."). Directories are marked with a trailing "/".
- PATTERN is an optional glob matched against the relative path: * matches within one path segment, ** matches across segments, {a,b} is alternation (e.g. **/*.{ts,tsx}). When PATTERN is set, only matching files are returned.
- DEPTH limits recursion (default 2; use -1 for unlimited). When a PATTERN is given, DEPTH defaults to unlimited.
- node_modules, .git and build folders are skipped automatically.

Example input (find every TypeScript file in the repo):
<TOOL>
<NAME>list-files</NAME>
<PATTERN>**/*.ts</PATTERN>
</TOOL>

Example output:
4 entries under "." matching **/*.ts:
src/cli.ts
src/tools/index.ts
src/tools/read-files.ts
src/utils/xml-utils.ts

Example input (see the top two levels of a folder):
<TOOL>
<NAME>list-files</NAME>
<PATH>src</PATH>
<DEPTH>2</DEPTH>
</TOOL>

Example output:
src/agent/
src/agent/parent.ts
src/cli.ts
src/tools/
src/tools/index.ts`;

const patch_files_tool_description = `Edit files using search/replace blocks.
For each <PATCH>, <OLD_STR> is replaced with <NEW_STR>.
Rules:
- OLD_STR must match the file content EXACTLY (including whitespace and indentation).
- OLD_STR must appear EXACTLY ONCE in the file. If it appears multiple times, include more surrounding lines to make it unique.
- ALWAYS wrap OLD_STR and NEW_STR content in <![CDATA[ ... ]]> so whitespace, newlines, quotes and code survive exactly.
- To delete text, set NEW_STR to an empty CDATA: <![CDATA[]]>.
- To insert text, set OLD_STR to an existing adjacent line(s) and include it in NEW_STR along with the new text.
- If OLD_STR is empty the file is created (or NEW_STR appended if it exists).
- NEVER include line-number prefixes (like "12→") from read output in OLD_STR — they are not part of the file.

Example input (edit two files: fix a bug, delete a log line, create a new file):
<TOOL>
<NAME>patch-files</NAME>
<FILE>
<FILE_NAME>src/math.ts</FILE_NAME>
<PATCH>
<OLD_STR><![CDATA[export const add = (a: number, b: number) => {
  return a - b;
};]]></OLD_STR>
<NEW_STR><![CDATA[export const add = (a: number, b: number) => {
  return a + b;
};]]></NEW_STR>
</PATCH>
<PATCH>
<OLD_STR><![CDATA[  console.log("debug: adding");
]]></OLD_STR>
<NEW_STR><![CDATA[]]></NEW_STR>
</PATCH>
</FILE>
<FILE>
<FILE_NAME>src/math.test.ts</FILE_NAME>
<PATCH>
<OLD_STR><![CDATA[]]></OLD_STR>
<NEW_STR><![CDATA[import { add } from "./math.js";

test("adds", () => {
  expect(add(1, 2)).toBe(3);
});
]]></NEW_STR>
</PATCH>
</FILE>
</TOOL>

Example output:
src/math.ts: OK — updated — 2 patch(es) applied
src/math.test.ts: OK — created — 1 patch(es) applied`;

const read_files_tool_description = `Read one or more files, returning line-numbered content.
- start_line is 1-based and inclusive; end_line is inclusive; use end_line: -1 to read to the end.
- Output lines are prefixed "N→". This prefix is NOT part of the file — never include it in old_str when patching.
- Large output is truncated; request a narrower line range if you see [TRUNCATED].
- Prefer reading large meaningful ranges over many small reads. Batch multiple files into ONE call.

Example input (read two files: one fully, one partially):
<TOOL>
<NAME>read-files</NAME>
<FILE>
<FILE_NAME>src/math.ts</FILE_NAME>
<START_LINE>1</START_LINE>
<END_LINE>-1</END_LINE>
</FILE>
<FILE>
<FILE_NAME>src/cli.ts</FILE_NAME>
<START_LINE>10</START_LINE>
<END_LINE>12</END_LINE>
</FILE>
</TOOL>

Example output:
=== src/math.ts  ===
1→export const add = (a: number, b: number) => {
2→  return a + b;
3→};

=== src/cli.ts  ===
10→program
11→  .name("crack-head")
12→  .option("-D, --direct <prompt>", "one-shot answer, no TUI")

Example output when a file is missing:
=== src/missing.ts (ERROR) ===
Could not read "src/missing.ts": ENOENT: no such file or directory. Check the path — it may not exist.`;

const search_code_tool_description = `Search file contents with a regular expression (like ripgrep). Returns matching lines as "relative/path:line: text".
- PATTERN is a JavaScript regular expression (required). Wrap it in CDATA so metacharacters survive.
- PATH is the directory to search under (default "."). INCLUDE is an optional glob on the file name (e.g. *.ts or *.{ts,tsx}).
- Set IGNORE_CASE to true for case-insensitive search. Results are capped by MAX_RESULTS (default 100).
- node_modules, .git and build folders are skipped automatically. Prefer this over grep via use-shell — output is structured and cross-platform.

Example input (find every exported const under src):
<TOOL>
<NAME>search-code</NAME>
<PATTERN><![CDATA[export const \\w+]]></PATTERN>
<PATH>src</PATH>
<INCLUDE>*.ts</INCLUDE>
</TOOL>

Example output:
3 match(es) for /export const \\w+/ in 2 file(s):
src/tools/index.ts:21: export const available_tools = [
src/tools/index.ts:36: export const formatAvailableToolsXml = (): string =>
src/utils/xml-utils.ts:1: export function extractXmlContent(tag: string, input: string): string | null {

Example output (no matches — broaden the pattern or change PATH, don't just retry):
No matches for /frobnicate/ in "src". Searched 12 file(s). Try a broader pattern or different path.`;

const run_command_tool_description = `Execute a shell command and return stdout, stderr, and exit code.
- Runs in bash: pipes, &&, globs, and redirection all work.
- Non-zero exit codes are returned, not thrown — check exit_code to know if the command failed.
- Default timeout 30s (set timeout_ms up to 300000 for long builds/tests).
- Use this ONLY for one-shot commands that exit on their own. For long-lived processes (dev servers, watch mode) use the background-shell tool — here they would just time out.
- Output is truncated if very large; pipe through grep/head/tail to narrow it.
- All the shell commands passed here will be run in sequential order, only after first one finishes

Example input (run tests with a longer timeout):
<TOOL>
<NAME>use-shell</NAME>
<COMMAND><![CDATA[pnpm test]]></COMMAND>
<TIMEOUT_MS>120000</TIMEOUT_MS>
</TOOL>

Example output (success):
exit_code: 0
--- stdout ---
✓ src/math.test.ts (3 tests) 12ms
Test Files  1 passed (1)

Example output (failure — read stderr and fix the code, don't just retry):
exit_code: 1
--- stderr ---
src/math.ts(2,10): error TS2322: Type 'string' is not assignable to type 'number'.

Example output (timeout):
exit_code: TIMEOUT
[Command timed out after 30000ms. If this is a long build/test, retry with a higher timeout_ms. If it's a server/watch process, use the background-shell tool instead — it never exits.]

Example input (narrow noisy output):
<TOOL>
<NAME>use-shell</NAME>
<COMMAND><![CDATA[pnpm build 2>&1 | grep -i error | head -20]]></COMMAND>
</TOOL>`;

const background_shell_tool_description = `Start and manage long-lived background processes (dev servers, watchers, queues) that never exit on their own. Unlike use-shell, these are NOT killed by a timeout — they keep running so you can start a server, hit it, and read its logs. All background processes are killed automatically when the run ends.

Pick an <ACTION>:
- start: spawn <COMMAND> in the background. Returns a numbered PROCESS_ID plus whatever it printed in the first ~1.5s (so you can tell if it booted or crashed on startup). Optional <CWD> and <SETTLE_MS> (how long to watch startup, max 15000).
- logs: read everything a process has printed so far. Requires <PROCESS_ID>. Use this after 'start' to check a server is ready before you curl it.
- list: show every background process with its status (running / exited) and command.
- stop: terminate a process (SIGTERM, then SIGKILL). Requires <PROCESS_ID>. Kills the whole process tree.

Guidance:
- Use this ONLY for processes that don't exit by themselves. For one-shot builds/tests/greps use the use-shell tool.
- After start, if status is "exited" the command crashed immediately — read the output and fix it, don't just restart.
- If a process is running but not yet ready, call 'logs' again a moment later; don't assume it's broken.

Example input (start a dev server):
<TOOL>
<NAME>background-shell</NAME>
<ACTION>start</ACTION>
<COMMAND><![CDATA[npm run dev]]></COMMAND>
</TOOL>

Example output (started):
Started background process #1 — running (pid 40213, up 1s).
It keeps running in the background. Use action 'logs' with PROCESS_ID 1 to read new output, and 'stop' to terminate it.
--- output (first 1500ms) ---
VITE v5.4.0  ready in 320 ms
Local:   http://localhost:5173/

Example input (check its logs, then stop it):
<TOOL>
<NAME>background-shell</NAME>
<ACTION>logs</ACTION>
<PROCESS_ID>1</PROCESS_ID>
</TOOL>
<TOOL>
<NAME>background-shell</NAME>
<ACTION>stop</ACTION>
<PROCESS_ID>1</PROCESS_ID>
</TOOL>

Example output (start where the command crashed on boot):
Background process #2 exited during the first 1500ms — exited (code 1).
It did not stay up. Read the output below to see why (this usually means the command crashed on startup).
--- output (first 1500ms) ---
Error: Cannot find module 'express'`;

export const available_tools = [
  {
    name: "read-files",
    description: read_files_tool_description,
  },
  {
    name: "patch-files",
    description: patch_files_tool_description,
  },
  {
    name: "use-shell",
    description: run_command_tool_description,
  },
  {
    name: "background-shell",
    description: background_shell_tool_description,
  },
  {
    name: "search-code",
    description: search_code_tool_description,
  },
  {
    name: "list-files",
    description: list_files_tool_description,
  },
  {
    name: "finish",
    description: finish_tool_description,
  },
];

export const formatAvailableToolsXml = (): string =>
  available_tools
    .map(
      (t) => `<TOOL>
<NAME>${t.name}</NAME>
<DESCRIPTION>
${t.description}
</DESCRIPTION>
</TOOL>`,
    )
    .join("\n\n");

export const executeTools = async (
  toolsXml: string,
  sandboxId: string,
): Promise<string> => {
  const res = await axios.post(
    `${process.env.SANDBOX_CONTROLLER_URL}/sandbox/use-tools`,
    { toolsXml, sandboxId },
    { headers: { "x-internal-key": process.env.INTERNAL_API_KEY ?? "" } },
  );

  // Return the sandbox's tool output string, not the whole JSON envelope.
  return typeof res.data?.output === "string"
    ? res.data.output
    : JSON.stringify(res.data);
};
