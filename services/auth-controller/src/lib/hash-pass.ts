import { createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export const hashPassword = (pass: string) => {
  return sha256(pass);
};

export const verifypass = (pass: string, storedhash: string) => {
  return sha256(pass) == storedhash;
};
