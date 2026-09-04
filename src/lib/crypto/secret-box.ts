import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption for secrets that have to be stored and read back — today, the
// Meta access tokens.
//
// Those tokens are not credentials for MAIRO. They are credentials for the
// customer's ad account: anyone holding one can create campaigns and spend
// that business's money. Passwords in this app are hashed and never recovered;
// tokens have to be decrypted to be used, so they are encrypted instead. The
// threat this closes is a database copy — a leaked dump, a stolen backup, a
// misconfigured replica — where plaintext tokens would be immediately usable
// and encrypted ones are inert without the key, which lives in the
// environment and not in the database.
//
// AES-256-GCM: authenticated, so a tampered ciphertext fails loudly instead of
// decrypting to garbage. A fresh random IV per encryption, which is what makes
// it safe to encrypt the same token twice.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const KEY_BYTES = 32; // AES-256

// Stored values carry their format so this can change without a migration:
// anything that does not start with a known prefix is read as plaintext.
const PREFIX = "v1";

class MissingKeyError extends Error {}

function readKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  // Accept either encoding — base64 is what `openssl rand -base64 32` gives,
  // hex is what a lot of key generators give, and pasting the wrong one into
  // a hosting dashboard should not be a silent failure.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

/** Whether this deployment is configured to encrypt at all. */
export function encryptionConfigured(): boolean {
  return Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim());
}

/** Whether a stored value is in encrypted form. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

/**
 * Encrypts a secret for storage.
 *
 * With no key configured this returns the value unchanged rather than throwing.
 * That is deliberate: adding this feature must not take a running deployment
 * offline the moment it ships and before the variable is set. The setup check
 * page reports the unconfigured state so it cannot go unnoticed.
 */
export function encryptSecret(plaintext: string): string {
  const key = readKey();
  if (!key) {
    console.warn(
      "TOKEN_ENCRYPTION_KEY is not set — storing a Meta access token in plain text. " +
        "Set it and this token will be encrypted the next time it is written."
    );
    return plaintext;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Reads a stored secret back.
 *
 * Values written before encryption was switched on are returned as they are.
 * That is what lets the key be introduced to a live deployment without a
 * migration step and without breaking the connections already in the database
 * — they upgrade themselves the next time they are written.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const key = readKey();
  if (!key) {
    // A value that was encrypted cannot be read without the key. Silently
    // returning the ciphertext would send it to Meta as if it were a token and
    // produce a baffling auth error, so this fails where the cause is obvious.
    throw new MissingKeyError(
      "This Meta connection is encrypted but TOKEN_ENCRYPTION_KEY is not set on this deployment. " +
        "Restore the variable — without it the stored tokens cannot be read."
    );
  }

  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Stored secret is malformed and cannot be decrypted.");
  }
  const [, ivB64, tagB64, dataB64] = parts;

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM's authentication tag failed: wrong key, or the stored value was
    // altered. Either way this is not a token and must not be used as one.
    throw new Error(
      "A stored Meta token failed to decrypt. The encryption key may have changed, " +
        "or the stored value was modified."
    );
  }
}
