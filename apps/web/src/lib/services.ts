// Central registry of the backend microservices the web app talks to.
// Override per environment with the NEXT_PUBLIC_* vars below; defaults target
// local dev. Because these are read in the browser they MUST be NEXT_PUBLIC_*.
export const SERVICES = {
  // auth-controller: login/signup, GitHub OAuth, user details.
  auth:
    process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ??
    process.env.NEXT_PUBLIC_CONTROLLER_SERVICE_URL ??
    "http://localhost:4000",

  // agent-controller: chat orchestration + chat list.
  agent: process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ?? "http://localhost:7000",

  // sandbox-controller: sandbox creation + tool execution.
  sandbox:
    process.env.NEXT_PUBLIC_SANDBOX_SERVICE_URL ?? "http://localhost:5000",
} as const;

export type ServiceName = keyof typeof SERVICES;
