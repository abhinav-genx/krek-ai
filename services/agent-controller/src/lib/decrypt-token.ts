import crypto from "node:crypto";

const ENC_ALGO = "aes-256-gcm";

// Mirrors auth-controller's token format ("v1.iv.ciphertext.tag", base64url).
// Lazy + non-throwing: a missing/invalid key or payload just yields null so the
// service degrades to public-only cloning instead of crashing.
const getKey = (): Buffer | null => {
  const b64 = process.env.GITHUB_TOKEN_ENC_KEY_B64;
  if (!b64) return null;
  const key = Buffer.from(b64, "base64");
  return key.length === 32 ? key : null;
};

export const decryptToken = (payload: string): string | null => {
  const key = getKey();
  if (!key) return null;

  const [v, ivB64, ctB64, tagB64] = payload.split(".");
  if (v !== "v1" || !ivB64 || !ctB64 || !tagB64) return null;

  try {
    const iv = Buffer.from(ivB64, "base64url");
    const ciphertext = Buffer.from(ctB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");

    const decipher = crypto.createDecipheriv(ENC_ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
};
