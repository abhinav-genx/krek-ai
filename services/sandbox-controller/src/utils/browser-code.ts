// Shell snippets run inside the E2B sandbox (Debian 13, passwordless sudo) to
// install and launch a real Chromium browser on a virtual X display, exposed to
// the user over noVNC at port 6080 (VNC on 5900, display :1).

const NOVNC = "http://127.0.0.1:6080/vnc.html";

export const BROWSER_PORT = 6080;

// Foreground: create a per-sandbox VNC password, install the browser + VNC
// stack once, and report readiness. Prints KREK_* markers on stdout.
export const ensureBrowserScript = (): string =>
  [
    'PASS_FILE="$HOME/.krek-browser-pass"',
    'if [ ! -f "$PASS_FILE" ]; then',
    "  head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | cut -c1-16 > \"$PASS_FILE\"",
    "fi",
    `if curl -sf -o /dev/null --max-time 2 ${NOVNC}; then`,
    '  echo "KREK_PASS=$(cat "$PASS_FILE")"; echo "KREK_DEPS=OK"; echo "KREK_RUNNING=1"; exit 0',
    "fi",
    "if ! command -v Xvfb >/dev/null 2>&1 || ! command -v x11vnc >/dev/null 2>&1 || ! command -v websockify >/dev/null 2>&1 || ! command -v chromium >/dev/null 2>&1 || [ ! -d /usr/share/novnc ]; then",
    "  sudo -n DEBIAN_FRONTEND=noninteractive apt-get update -y >/tmp/krek-browser-install.log 2>&1 || true",
    "  sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb x11vnc fluxbox novnc websockify chromium >>/tmp/krek-browser-install.log 2>&1 || true",
    "fi",
    "DEPS=OK",
    "for b in Xvfb x11vnc websockify chromium; do command -v \"$b\" >/dev/null 2>&1 || DEPS=MISSING; done",
    "[ -d /usr/share/novnc ] || DEPS=MISSING",
    'echo "KREK_PASS=$(cat "$PASS_FILE")"',
    'echo "KREK_DEPS=$DEPS"',
    'echo "KREK_RUNNING=0"',
  ].join("\n");

// Long-running stack, launched as one E2B background command. Xvfb/fluxbox/
// x11vnc/chromium are detached into their own process groups so they survive,
// and websockify runs in the foreground to keep the background command alive.
// The password is alphanumeric, so double-quoting cannot break out of the shell.
export const startBrowserCmd = (password: string): string =>
  [
    "export DISPLAY=:1",
    "( Xvfb :1 -screen 0 1280x800x24 -nolisten tcp >/tmp/krek-xvfb.log 2>&1 & )",
    "sleep 1",
    "( fluxbox >/tmp/krek-fluxbox.log 2>&1 & )",
    `( x11vnc -display :1 -forever -shared -rfbport 5900 -passwd "${password}" -noxdamage >/tmp/krek-x11vnc.log 2>&1 & )`,
    "sleep 1",
    '( chromium --no-sandbox --no-first-run --no-default-browser-check --disable-gpu --start-maximized --window-position=0,0 --user-data-dir=/tmp/krek-chrome "https://www.google.com" >/tmp/krek-chromium.log 2>&1 & )',
    "websockify --web=/usr/share/novnc 6080 localhost:5900",
  ].join("\n");

// Foreground: wait until noVNC is serving before we hand back a URL. Bounded by
// a wall-clock deadline (~90s) rather than an iteration count so its worst-case
// runtime is predictable; the caller's command timeout sits above this deadline
// so the wait is never cut short mid-boot (which used to 502 on first launch).
// The full X + Chromium + websockify stack is heavy, so allow generous time.
export const browserReadyScript = (): string =>
  [
    'deadline=$(( $(date +%s) + 90 ))',
    'while [ "$(date +%s)" -lt "$deadline" ]; do',
    `  if curl -sf -o /dev/null --max-time 2 ${NOVNC}; then echo "KREK_READY=1"; exit 0; fi`,
    "  sleep 1",
    "done",
    'echo "KREK_READY=0"',
  ].join("\n");
