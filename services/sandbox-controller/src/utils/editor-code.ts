// Shell snippets run inside the E2B sandbox to install and launch code-server
// (VS Code in the browser, with an integrated terminal) bound to 0.0.0.0:8080
// so it can be reached through the sandbox's public host.

const HEALTHZ = "http://127.0.0.1:8080/healthz";
const PORT = 8080;

export const EDITOR_PORT = PORT;

const WORKSPACE_DIR = '"$HOME/workspace-krek-ai"';

// code-server User settings: turn off Copilot/chat agent mode and let the
// folder-open terminal task below run without a workspace-trust or automation
// prompt (both gates would otherwise block auto-running tasks in the iframe).
const EDITOR_USER_SETTINGS = JSON.stringify(
  {
    "chat.agent.enabled": false,
    "chat.commandCenter.enabled": false,
    "workbench.colorTheme": "Default Dark Modern",
    "workbench.startupEditor": "none",
    "security.workspace.trust.enabled": false,
    "task.allowAutomaticTasks": "on",
  },
  null,
  2,
);

// Workspace task that opens an integrated terminal automatically whenever the
// folder is opened, so the shell is visible by default in the editor.
const EDITOR_TASKS_JSON = JSON.stringify(
  {
    version: "2.0.0",
    tasks: [
      {
        label: "krek: open terminal",
        type: "shell",
        command: "clear",
        presentation: {
          echo: false,
          reveal: "always",
          focus: true,
          panel: "shared",
          showReuseMessage: false,
          clear: true,
        },
        runOptions: { runOn: "folderOpen" },
        problemMatcher: [],
      },
    ],
  },
  null,
  2,
);

// Write the code-server User settings and the workspace tasks.json into the
// sandbox. Quoted heredoc delimiters keep the JSON verbatim (no shell expansion).
const writeEditorConfig = (): string =>
  [
    'mkdir -p "$HOME/.local/share/code-server/User"',
    `cat > "$HOME/.local/share/code-server/User/settings.json" <<'KREK_SETTINGS_EOF'`,
    EDITOR_USER_SETTINGS,
    "KREK_SETTINGS_EOF",
    `mkdir -p ${WORKSPACE_DIR}/.vscode`,
    `cat > ${WORKSPACE_DIR}/.vscode/tasks.json <<'KREK_TASKS_EOF'`,
    EDITOR_TASKS_JSON,
    "KREK_TASKS_EOF",
  ].join("\n");

// Foreground: make sure the code-server binary exists, then report whether the
// server is already listening. A previously-started password instance (which
// can't be logged into from a cross-site iframe) is killed so we can relaunch it
// in no-auth mode below. Machine-readable KREK_* markers are printed on stdout.
export const ensureEditorScript = (): string =>
  [
    "set -e",
    writeEditorConfig(),
    "if ! command -v code-server >/dev/null 2>&1; then",
    "  curl -fsSL https://code-server.dev/install.sh | sh >/tmp/krek-code-server-install.log 2>&1 || true",
    "fi",
    'BIN="$(command -v code-server || true)"',
    "RUNNING=0",
    `if curl -sf -o /dev/null --max-time 2 ${HEALTHZ}; then`,
    '  if [ -f "$HOME/.krek-editor-none" ]; then',
    "    RUNNING=1",
    "  else",
    '    pkill -f "bind-addr 0.0.0.0:8080" >/dev/null 2>&1 || true',
    "    sleep 1",
    "  fi",
    "fi",
    'echo "KREK_BIN=${BIN:-MISSING}"',
    'echo "KREK_RUNNING=$RUNNING"',
  ].join("\n");

// Long-running server, launched via E2B's background command API so it survives
// after the SDK disconnects. A supervisor loop relaunches code-server if it ever
// exits/crashes (its pty host can take the server down) so the workbench's
// auto-reconnect succeeds in seconds instead of looping on 502 forever. `flock`
// guards against a second /editor call spawning a duplicate supervisor. Runs
// with --auth none because a login cookie can't be set inside a cross-site
// iframe; access is gated by the unguessable public sandbox host. The marker
// file records that this instance is no-auth.
export const startEditorCmd = (): string =>
  [
    'touch "$HOME/.krek-editor-none"',
    'mkdir -p "$HOME/.krek-editor"',
    // Single-supervisor lock: released automatically if the holder dies.
    'exec 9>"$HOME/.krek-editor/supervisor.lock"',
    "flock -n 9 || exit 0",
    "while true; do",
    `  code-server --bind-addr 0.0.0.0:${PORT} --auth none --disable-telemetry --disable-update-check ${WORKSPACE_DIR} >>"$HOME/.krek-editor/server.log" 2>&1`,
    '  echo "[krek-supervisor] code-server exited ($?) at $(date -u), restarting" >>"$HOME/.krek-editor/server.log"',
    "  sleep 1",
    "done",
  ].join("\n");

// Foreground: poll the health endpoint until code-server accepts connections.
// Bounded by a wall-clock deadline (~60s) rather than an iteration count so its
// worst-case runtime is predictable — the caller sets a command timeout above
// this deadline so the wait can never be cut short (a premature cut used to
// surface as a spurious 502 the user had to "Try again" past). Cold starts are
// slower here because the agent is often hammering the same sandbox.
export const editorReadyScript = (): string =>
  [
    'deadline=$(( $(date +%s) + 60 ))',
    'while [ "$(date +%s)" -lt "$deadline" ]; do',
    `  if curl -sf -o /dev/null --max-time 2 ${HEALTHZ}; then echo "KREK_READY=1"; exit 0; fi`,
    "  sleep 1",
    "done",
    'echo "KREK_READY=0"',
  ].join("\n");

// Extract a `KEY=value` marker printed by the scripts above.
export const parseMarker = (
  output: string,
  key: string,
): string | undefined => {
  const match = output.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim();
};
