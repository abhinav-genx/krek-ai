// Runs crack-head's built CLI (dist/cli.js) headlessly with --use-tools. We
// invoke it by absolute path via node rather than a global `crack-head` bin, so
// it does not depend on the sandbox's global npm bin being on PATH.
export const crackHeadRunnerPyCode = (
  toolsXml: string,
  workspaceDir = "workspace-krek-ai",
) => {
  return `
import os
import subprocess

WORKSPACE = os.path.expanduser(os.path.join("~", ${JSON.stringify(workspaceDir)}))
CLI = os.path.join(WORKSPACE, "crack-head", "dist", "cli.js")

if not os.path.isfile(CLI):
    print(f"ERROR: crack-head CLI not found at {CLI} (build may have failed)")
    print("exit_code=127")
else:
    result = subprocess.run(
        ["node", CLI, "--use-tools", ${JSON.stringify(toolsXml)}],
        cwd=WORKSPACE,
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    print(result.stderr)
    print(f"exit_code={result.returncode}")
`;
};

// Clones + installs crack-head and clones every user repo into `workspaceDir`
// on the sandbox. Repos are given as "owner/name"; when a GitHub token is present
// it is injected into the clone URL so private repos work. Values are embedded as
// JSON literals (valid Python) and every command runs via a subprocess argument
// list, so user-supplied values can never break out into shell execution. The
// token is redacted from all printed output so it never leaks into tool results.
export const setupWorkspacePyCode = ({
  crackHeadRepoUrl,
  repos,
  githubToken,
  workspaceDir,
}: {
  crackHeadRepoUrl: string;
  repos: string[];
  githubToken?: string;
  workspaceDir: string;
}) => {
  return `
import os
import subprocess

WORKSPACE = os.path.expanduser(os.path.join("~", ${JSON.stringify(workspaceDir)}))
CRACK_HEAD_URL = ${JSON.stringify(crackHeadRepoUrl)}
REPOS = ${JSON.stringify(repos)}
GITHUB_TOKEN = ${JSON.stringify(githubToken ?? "")}

os.makedirs(WORKSPACE, exist_ok=True)


def _redact(text):
    if GITHUB_TOKEN and text:
        return text.replace(GITHUB_TOKEN, "***")
    return text


def run(cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    print(_redact(f"$ {' '.join(cmd)}"))
    print(_redact(result.stdout))
    print(_redact(result.stderr))
    print(f"exit_code={result.returncode}")
    return result.returncode


# Clone and install crack-head
crack_head_dir = os.path.join(WORKSPACE, "crack-head")
if os.path.isdir(crack_head_dir):
    print("crack-head already cloned")
else:
    run(["git", "clone", CRACK_HEAD_URL, crack_head_dir])

if os.path.isdir(crack_head_dir):
    # crack-head is a pnpm project whose package.json uses the pnpm-only "link:"
    # protocol (npm fails with EUNSUPPORTEDPROTOCOL), and its CLI is the built
    # dist/cli.js -- so install with pnpm and run the build.
    run(["npm", "install", "-g", "pnpm"])
    run(["pnpm", "install"], cwd=crack_head_dir)
    run(["pnpm", "run", "build"], cwd=crack_head_dir)
else:
    print("crack-head clone failed; skipping install")

# Clone every user-selected repo ("owner/name", or a full URL) into the workspace.
for repo in REPOS:
    raw = repo.rstrip("/")
    name = raw.split("/")[-1]
    if name.endswith(".git"):
        name = name[:-4]
    target = os.path.join(WORKSPACE, name)
    if os.path.isdir(target):
        print(f"skip: {name} already exists")
        continue
    if "://" in raw:
        clone_url = raw
    elif GITHUB_TOKEN:
        clone_url = f"https://x-access-token:{GITHUB_TOKEN}@github.com/{raw}.git"
    else:
        clone_url = f"https://github.com/{raw}.git"
    run(["git", "clone", clone_url, target])

print(f"workspace_dir={WORKSPACE}")
print("workspace_ready=true")
`;
};
