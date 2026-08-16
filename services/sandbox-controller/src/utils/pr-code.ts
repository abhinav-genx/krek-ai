// Python run inside the E2B sandbox to open a pull request for each repo the
// agent worked on. For every repo dir under the workspace it: stages ALL changes,
// commits them on a new branch, pushes with a token-injected remote URL, then
// opens a PR via the GitHub REST API (urllib — no extra deps). Everything runs
// via subprocess argument lists (never a shell string) and the token is redacted
// from all printed output, so user/agent-supplied values can't break out or leak.
//
// It prints one machine-readable line: `KREK_PR_RESULT=<json>` where json is
// { results: [{ repo, url?, branch?, skipped?, error? }] } so the caller can
// parse the outcome regardless of surrounding log noise.
export const createPrPyCode = ({
  repos,
  branch,
  title,
  body,
  githubToken,
  workspaceDir,
}: {
  repos: string[];
  branch: string;
  title: string;
  body: string;
  githubToken: string;
  workspaceDir: string;
}) => {
  return `
import os
import json
import subprocess
import urllib.request
import urllib.error

WORKSPACE = os.path.expanduser(os.path.join("~", ${JSON.stringify(workspaceDir)}))
REPOS = ${JSON.stringify(repos)}
BRANCH = ${JSON.stringify(branch)}
TITLE = ${JSON.stringify(title)}
BODY = ${JSON.stringify(body)}
TOKEN = ${JSON.stringify(githubToken)}


def redact(text):
    if TOKEN and text:
        return text.replace(TOKEN, "***")
    return text


def run(cmd, cwd=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    print(redact("$ " + " ".join(cmd)))
    if r.stdout:
        print(redact(r.stdout))
    if r.stderr:
        print(redact(r.stderr))
    return r


def repo_dir_name(raw):
    raw = raw.rstrip("/")
    name = raw.split("/")[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return name


def owner_repo(raw, remote_url):
    # Prefer the "owner/name" the caller passed; fall back to parsing the remote.
    raw = raw.rstrip("/")
    if "://" not in raw and raw.count("/") == 1:
        return raw
    src = remote_url or raw
    src = src.strip()
    if src.endswith(".git"):
        src = src[:-4]
    if src.startswith("git@"):
        # git@github.com:owner/name
        src = src.split(":", 1)[-1]
    elif "github.com/" in src:
        src = src.split("github.com/", 1)[-1]
    parts = [p for p in src.split("/") if p]
    if len(parts) >= 2:
        return parts[-2] + "/" + parts[-1]
    return None


def create_pr_api(slug, head, base):
    url = "https://api.github.com/repos/" + slug + "/pulls"
    payload = json.dumps({"title": TITLE, "body": BODY, "head": head, "base": base}).encode()
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "krek-ai")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            return data.get("html_url"), None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        try:
            j = json.loads(detail)
            # A PR for this head may already exist -> surface its URL if given.
            errs = j.get("errors") or []
            msg = j.get("message", "")
            if any("A pull request already exists" in str(x) for x in errs):
                return None, "A pull request already exists for " + head
            return None, msg or redact(detail)
        except Exception:
            return None, redact(detail)
    except Exception as e:
        return None, redact(str(e))


results = []
for raw in REPOS:
    name = repo_dir_name(raw)
    path = os.path.join(WORKSPACE, name)
    entry = {"repo": raw}
    if not os.path.isdir(os.path.join(path, ".git")):
        entry["error"] = "not a git repo (nothing cloned at " + name + ")"
        results.append(entry)
        continue

    # Determine the default (base) branch from the origin HEAD, fall back to main.
    base = "main"
    r = subprocess.run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], cwd=path, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        base = r.stdout.strip().split("/")[-1]

    # Configure a committer identity (sandbox has none by default).
    run(["git", "config", "user.email", "bot@krek.ai"], cwd=path)
    run(["git", "config", "user.name", "krek-ai"], cwd=path)

    # Create/switch to the PR branch.
    run(["git", "checkout", "-B", BRANCH], cwd=path)

    # Stage + commit everything. If there's nothing to commit we still try to open
    # a PR (the branch may already have commits ahead of base).
    run(["git", "add", "-A"], cwd=path)
    commit = subprocess.run(["git", "commit", "-m", TITLE], cwd=path, capture_output=True, text=True)
    print(redact(commit.stdout))
    print(redact(commit.stderr))

    # Make sure HEAD actually points at a commit before we try to push. If the
    # working tree had no changes AND the branch has no commits yet (e.g. the
    # repo was empty / freshly created with no initial commit), pushing
    # "HEAD:BRANCH" fails with "src refspec HEAD does not match any". Detect
    # that here and surface an actionable message instead of the raw git error.
    head_ok = subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=path, capture_output=True, text=True)
    if head_ok.returncode != 0:
        entry["error"] = (
            "nothing to push: no commits on this branch. The agent made no "
            "changes to this repo, or the repository is empty (no commits yet)."
        )
        results.append(entry)
        continue

    # Resolve the remote slug + push with a token-injected URL (never persisted).
    remote = subprocess.run(["git", "remote", "get-url", "origin"], cwd=path, capture_output=True, text=True)
    remote_url = remote.stdout.strip()
    slug = owner_repo(raw, remote_url)
    if not slug:
        entry["error"] = "could not determine owner/repo"
        results.append(entry)
        continue

    push_url = "https://x-access-token:" + TOKEN + "@github.com/" + slug + ".git"
    push = subprocess.run(["git", "push", push_url, "HEAD:" + BRANCH, "--force"], cwd=path, capture_output=True, text=True)
    print(redact("$ git push origin HEAD:" + BRANCH))
    print(redact(push.stdout))
    print(redact(push.stderr))
    if push.returncode != 0:
        entry["error"] = "push failed: " + redact(push.stderr.strip())[:300]
        results.append(entry)
        continue

    url, err = create_pr_api(slug, BRANCH, base)
    entry["branch"] = BRANCH
    if url:
        entry["url"] = url
    else:
        entry["error"] = err
    results.append(entry)

print("KREK_PR_RESULT=" + json.dumps({"results": results}))
`;
};

// Reports, per repo, how many files changed vs. the working tree (staged +
// unstaged + untracked) so the Create PR dialog can preview the diff. Prints
// `KREK_PR_STATUS=<json>` = { repos: [{ repo, changedFiles, files: [..] }] }.
export const prStatusPyCode = ({
  repos,
  workspaceDir,
}: {
  repos: string[];
  workspaceDir: string;
}) => {
  return `
import os
import json
import subprocess

WORKSPACE = os.path.expanduser(os.path.join("~", ${JSON.stringify(workspaceDir)}))
REPOS = ${JSON.stringify(repos)}


def repo_dir_name(raw):
    raw = raw.rstrip("/")
    name = raw.split("/")[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return name


out = []
for raw in REPOS:
    name = repo_dir_name(raw)
    path = os.path.join(WORKSPACE, name)
    entry = {"repo": raw, "changedFiles": 0, "files": []}
    if os.path.isdir(os.path.join(path, ".git")):
        r = subprocess.run(["git", "status", "--porcelain"], cwd=path, capture_output=True, text=True)
        lines = [ln for ln in r.stdout.splitlines() if ln.strip()]
        files = [ln[3:] if len(ln) > 3 else ln for ln in lines]
        entry["changedFiles"] = len(files)
        entry["files"] = files[:50]
    else:
        entry["error"] = "not a git repo"
    out.append(entry)

print("KREK_PR_STATUS=" + json.dumps({"repos": out}))
`;
};
