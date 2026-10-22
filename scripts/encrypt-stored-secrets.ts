// Encrypts stored access tokens and signing secrets that were written before
// TOKEN_ENCRYPTION_KEY was set.
//
// Those values stay readable — decryptSecret passes plain text through — and
// each one is encrypted the next time it is written. But a token that is never
// rewritten (a Meta connection that just keeps working) would sit in the
// database as plain text indefinitely. This finds them and, only when asked,
// encrypts them in place.
//
//   npx tsx scripts/encrypt-stored-secrets.ts           # count only; changes nothing
//   npx tsx scripts/encrypt-stored-secrets.ts --apply   # encrypt (needs TOKEN_ENCRYPTION_KEY)
//
// Never prints a value, only counts. Each write is conditional on the row
// still holding the plain text that was read, so a token refreshed while this
// runs is left alone; each value is checked to decrypt back to itself before
// it is written. Take a database backup (or Neon branch) first, and keep the
// key: once applied, the tokens can't be read without it.

import { db } from "../src/lib/db";
import { decryptSecret, encryptSecret, isEncrypted } from "../src/lib/crypto/secret-box";

type Target = { model: string; column: string };
const TARGETS: Target[] = [
  { model: "metaAdAccount", column: "accessToken" },
  { model: "platformConnection", column: "accessToken" },
  { model: "platformConnection", column: "refreshToken" },
  { model: "tikTokCreatorConnection", column: "accessToken" },
  { model: "tikTokCreatorConnection", column: "refreshToken" },
  { model: "gtmConnection", column: "accessToken" },
  { model: "gtmConnection", column: "refreshToken" },
  { model: "storeIngest", column: "shopifySecret" },
];

type Delegate = {
  findMany(args: unknown): Promise<Record<string, string | null>[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !process.env.TOKEN_ENCRYPTION_KEY?.trim()) {
    console.error("TOKEN_ENCRYPTION_KEY is not set, so nothing can be encrypted. Set it first (and keep a copy).");
    process.exitCode = 1;
    return;
  }

  let plain = 0;
  let encrypted = 0;
  for (const { model, column } of TARGETS) {
    const table = (db as unknown as Record<string, Delegate>)[model];
    const rows = (await table.findMany({ select: { id: true, [column]: true } })).filter((r) => r[column]);
    const todo = rows.filter((r) => r[column] && !isEncrypted(r[column]!));
    plain += todo.length;
    let done = 0;
    if (apply) {
      for (const row of todo) {
        const value = row[column]!;
        const sealed = encryptSecret(value);
        if (!isEncrypted(sealed) || decryptSecret(sealed) !== value) throw new Error(`Encryption check failed on ${model}.${column}; nothing more was written.`);
        done += (await table.updateMany({ where: { id: row.id, [column]: value }, data: { [column]: sealed } })).count;
      }
      encrypted += done;
    }
    console.log(`${model}.${column}: ${rows.length} stored, ${todo.length} in plain text${apply ? `, ${done} encrypted` : ""}`);
  }
  console.log(apply ? `\nEncrypted ${encrypted} of ${plain} plain-text values.` : `\n${plain} plain-text values. Run with --apply to encrypt them.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
