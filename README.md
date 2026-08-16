# krek-ai

A Turborepo monorepo containing the krek-ai web app and its backend
microservices. An agent runs in an E2B sandbox, clones repos, uses tools, and
streams its activity back to a live web UI with an in-sandbox VS Code editor and
virtual browser.

## Layout

```
apps/
  web/                 Next.js 16 web app (chat UI, editor + browser panes)
packages/
  db/                  Prisma client + schema (@krek-ai/db)
services/
  auth-controller/     Login/signup, GitHub OAuth, user details        (:4000)
  agent-controller/    Chat orchestration, agent swarm, SSE stream      (:7000)
  sandbox-controller/  E2B sandbox lifecycle, tool exec, editor/browser (:5000)
```

## Prerequisites

- Node.js >= 24
- pnpm 11 (`corepack enable`)
- A Postgres database (e.g. Neon)
- An [E2B](https://e2b.dev) API key and an [OpenRouter](https://openrouter.ai) key

## Getting started

```bash
pnpm install
pnpm dev            # turbo runs the web app + all controllers
```

Then open http://localhost:3000. The web app runs on :3000, and the controllers
on :4000 (auth), :5000 (sandbox), :7000 (agent).

## Environment variables

Each service has its own `.env.example` — copy it to `.env` and fill it in:

```bash
cp services/auth-controller/.env.example    services/auth-controller/.env
cp services/agent-controller/.env.example   services/agent-controller/.env
cp services/sandbox-controller/.env.example services/sandbox-controller/.env
cp .env.example .env   # root (used by the sandbox-controller — see note below)
```

> [!IMPORTANT]
> **`pnpm dev` loads each service's env from its own directory.** Every service
> does `import "dotenv/config"`, which loads the `.env` from the process's
> **current working directory**. Under `pnpm dev`, Turborepo runs `auth-controller`
> and `agent-controller` from their own package directories, so they load their
> **own** `services/<name>/.env`. The `sandbox-controller` runs from the repo
> root, so it loads the **root `.env`**.
>
> Practical consequences:
> - `DATABASE_URL` must be present in **each service's own `.env`** (auth &
>   agent). If it's missing, the auth middleware's DB lookup throws and every
>   authenticated route returns **`401 unauthorized user`** — even when the JWT
>   is valid.
> - `JWT_SECRET` **must be identical** across `auth-controller`,
>   `agent-controller`, and `sandbox-controller`. auth signs login tokens with
>   it; the others verify with it. A mismatch (or a duplicate `JWT_SECRET` line —
>   dotenv keeps the first — ) makes login tokens fail verification → 401.
> - `GITHUB_TOKEN_ENC_KEY_B64` must match between auth and agent (auth encrypts
>   the GitHub token, agent decrypts it for private-repo cloning).
> - `INTERNAL_API_KEY` must match between agent and sandbox (sent as the
>   `x-internal-key` header on internal calls).

### Where each variable lives

| Variable                   | auth | agent | sandbox | Notes                                   |
| -------------------------- | :--: | :---: | :-----: | --------------------------------------- |
| `JWT_SECRET`               |  ✅  |  ✅   |   ✅    | Must be the SAME value everywhere        |
| `DATABASE_URL`             |  ✅  |  ✅   |   ✅¹   | Postgres connection string               |
| `GITHUB_TOKEN_ENC_KEY_B64` |  ✅  |  ✅   |         | `openssl rand -base64 32`; same in both  |
| `INTERNAL_API_KEY`         |      |  ✅   |   ✅    | Same in both                             |
| `OPEN_ROUTER_API_KEY`      |      |  ✅   |         | + `OPEN_ROUTER_MODEL`                    |
| `SANDBOX_CONTROLLER_URL`   |      |  ✅   |         | `http://localhost:5000`                  |
| `CRACK_HEAD_REPO_URL`      |      |  ✅   |         | Tools repo cloned into each sandbox      |
| `E2B_API_KEY`              |      |       |   ✅    | Sandbox provider                         |
| `R2_*`                     |      |       |   ✅    | Optional; workspace snapshot/restore     |
| GitHub OAuth (`GITHUB_*`)  |  ✅  |       |         | `CLIENT_ID`/`SECRET`/`CALLBACK_URL`      |

¹ `sandbox-controller` picks these up from the **root `.env`** (it runs from the
repo root under `pnpm dev`).

## Troubleshooting

**`POST /chat` / `POST /chats` → 401 in a loop:** almost always an env problem in
the agent-controller, not a bug in your session. Check, in order:

1. You're actually logged in (a valid `authorization` cookie is set).
2. `JWT_SECRET` is identical in `services/auth-controller/.env`,
   `services/agent-controller/.env`, and `services/sandbox-controller/.env`
   (and appears only once per file).
3. `DATABASE_URL` is present in `services/agent-controller/.env` — a missing DB
   URL surfaces as a 401 because the auth middleware's user lookup throws.
4. Restart `pnpm dev` after editing any `.env` (env is read once at startup).

## Common commands

```bash
pnpm dev                       # run everything (turbo)
pnpm build                     # build all packages/services
pnpm --filter @krek-ai/db exec prisma migrate dev   # apply DB migrations
```
