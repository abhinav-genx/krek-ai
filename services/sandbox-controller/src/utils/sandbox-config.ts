// How long a sandbox stays alive before E2B reclaims it. E2B's default (~5 min)
// expires between the agent finishing its run and the user opening the editor or
// browser, so both panes 502 with "sandbox may have expired". We create sandboxes
// with a longer lifetime and refresh it each time a pane is opened (keep-alive).
const parsed = Number(process.env.SANDBOX_TIMEOUT_MS);
export const SANDBOX_TIMEOUT_MS =
  Number.isFinite(parsed) && parsed > 0 ? parsed : 1_800_000; // 30 min
