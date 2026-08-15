import type { RequestHandler } from "express";

const KEY = process.env.INTERNAL_API_KEY;

// Only trusted services that know the shared secret may drive the sandbox.
// If no key is configured, allow all requests so local dev stays frictionless.
export const requireInternalKey: RequestHandler = (req, res, next) => {
  if (!KEY) return next();
  if (req.header("x-internal-key") !== KEY) {
    return res.status(401).json({ error: "invalid or missing internal key" });
  }
  return next();
};
