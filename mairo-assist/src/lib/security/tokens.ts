import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A URL-safe random token with 256 bits of entropy. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Hex SHA-256, matching Postgres `encode(digest(x, 'sha256'), 'hex')`. */
export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
