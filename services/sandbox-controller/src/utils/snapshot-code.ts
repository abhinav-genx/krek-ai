// Shell snippets run inside the E2B sandbox to snapshot / restore the workspace
// to Cloudflare R2 via presigned URLs. The presigned URL is passed base64-encoded
// and decoded in-shell so its `?`/`&`/`=` characters can never break the command.

const WORKSPACE = "workspace-krek-ai";

// tar honors every .gitignore in the tree (`--exclude-vcs-ignores`) so ignored
// files/folders (node_modules, build output, .env, …) are never uploaded. We KEEP
// each repo's `.git` so the agent's changes stay tracked across sandbox recreates
// (needed for the Create PR flow), but FIRST strip any embedded credentials from
// every remote URL so the GitHub token is never written to storage: clone URLs
// use `https://x-access-token:<TOKEN>@github.com/...`, which we rewrite to the
// plain `https://github.com/...` form (the token is re-injected only at push time).
export const snapshotScript = (presignedPutUrlB64: string): string =>
  [
    "set -e",
    'cd "$HOME"',
    `if [ ! -d "${WORKSPACE}" ]; then echo "KREK_SNAPSHOT=nodir"; exit 0; fi`,
    `URL="$(printf %s '${presignedPutUrlB64}' | base64 -d)"`,
    // Sanitize every repo remote so no credentials are captured in .git/config.
    `for cfg in "${WORKSPACE}"/*/.git/config; do`,
    '  [ -f "$cfg" ] || continue',
    `  sed -i -E 's#https://[^@/]*@github.com#https://github.com#g' "$cfg"`,
    "done",
    `tar czf /tmp/krek-ws.tar.gz --exclude-vcs-ignores "${WORKSPACE}"`,
    'curl -sf -X PUT -T /tmp/krek-ws.tar.gz "$URL"',
    "rm -f /tmp/krek-ws.tar.gz",
    'echo "KREK_SNAPSHOT=ok"',
  ].join("\n");

// Download the tarball and extract it into $HOME, recreating workspace-krek-ai.
export const restoreScript = (presignedGetUrlB64: string): string =>
  [
    "set -e",
    'cd "$HOME"',
    `URL="$(printf %s '${presignedGetUrlB64}' | base64 -d)"`,
    'curl -fsSL "$URL" -o /tmp/krek-ws.tar.gz',
    'tar xzf /tmp/krek-ws.tar.gz -C "$HOME"',
    "rm -f /tmp/krek-ws.tar.gz",
    'echo "KREK_RESTORE=ok"',
  ].join("\n");
