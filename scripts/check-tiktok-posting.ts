// Checks the decisions behind "MAIRO posts to your TikTok for you".
//
// No database and no network: everything here is a pure function that decides
// something a customer will feel. Run it with:
//   npm run check:tiktok
//
// The three that matter most:
//
// planChunks encodes TikTok's upload rules, and getting them wrong produces an
// upload that succeeds and then fails to transcode with no explanation.
//
// chooseMode decides whether MAIRO posts to the profile or drops a draft, and
// the whole honesty of the feature rests on it — describing a draft as a post
// is the one thing this must never do.
//
// resolvePrivacy enforces TikTok's rule that an unaudited app may only post
// privately. If that ever silently asked for public, a customer would be told
// their ad went out to everyone when it went out to nobody.

import {
  TIKTOK_VIDEO_LIMITS,
  planChunks,
  tiktokPostingAudited,
} from "@/lib/ad-platforms/tiktok/content";
import { chooseMode, resolvePrivacy, validateCaption } from "@/lib/tiktok/publish";
import { handleProblem, normalizeHandle } from "@/lib/tiktok/managed-setup";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const MB = 1024 * 1024;

function info(options: string[]) {
  return {
    nickname: null,
    username: null,
    avatarUrl: null,
    privacyLevelOptions: options,
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
    maxDurationSeconds: 600,
  };
}

console.log("\n— TikTok's chunking rules —");
{
  const small = planChunks(2 * MB);
  ok("a small file goes as one chunk", small.totalChunks === 1 && small.chunkSize === 2 * MB);

  const exact = planChunks(5 * MB);
  ok("exactly the minimum is still one chunk", exact.totalChunks === 1);

  const big = planChunks(12 * MB);
  ok("12MB splits into 2 chunks of 5MB", big.totalChunks === 2 && big.chunkSize === 5 * MB);
  // The remainder rides with the last chunk. TikTok rejects a final chunk
  // smaller than the minimum, so 12MB must never become 2 + a 2MB tail.
  const lastChunk = 12 * MB - (big.totalChunks - 1) * big.chunkSize;
  ok("the last chunk carries the remainder", lastChunk === 7 * MB, `${lastChunk}`);
  ok("no chunk is under TikTok's minimum", lastChunk >= TIKTOK_VIDEO_LIMITS.minChunkBytes);

  const huge = planChunks(101 * MB);
  const tail = 101 * MB - (huge.totalChunks - 1) * huge.chunkSize;
  ok("a large file still ends legally", tail >= TIKTOK_VIDEO_LIMITS.minChunkBytes, `${tail}`);
  ok(
    "every chunk is within TikTok's ceiling",
    huge.chunkSize <= TIKTOK_VIDEO_LIMITS.maxChunkBytes
  );

  // The sum has to be the file, exactly. TikTok compares byte counts.
  const covered = (huge.totalChunks - 1) * huge.chunkSize + tail;
  ok("the chunks add up to the whole file", covered === 101 * MB, `${covered}`);
}

console.log("\n— which posting path a customer gets —");
{
  const audited = tiktokPostingAudited();

  const publisher = chooseMode({ canPublish: true, canUpload: true });
  ok(
    "publish permission on an audited app posts directly",
    audited ? publisher.mode === "DIRECT_POST" : publisher.mode === "INBOX"
  );

  const uploader = chooseMode({ canPublish: false, canUpload: true });
  ok("upload-only lands in drafts", uploader.mode === "INBOX");
  ok(
    "and says so rather than calling it posting",
    /draft/i.test(uploader.reason) && !/post this straight/i.test(uploader.reason)
  );

  const neither = chooseMode({ canPublish: false, canUpload: false });
  ok("no video permission means no mode at all", neither.mode === null);
  ok("and it names the fix", /reconnect/i.test(neither.reason));
}

console.log("\n— TikTok's rule that unaudited apps post privately —");
{
  const full = info(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]);
  const asked = resolvePrivacy("PUBLIC_TO_EVERYONE", full);

  if (tiktokPostingAudited()) {
    ok("an audited app may honour a public request", asked.level === "PUBLIC_TO_EVERYONE");
  } else {
    ok("an unaudited app forces private", asked.level === "SELF_ONLY");
    ok("and explains why rather than failing quietly", Boolean(asked.note));
  }

  // With the audit gate out of the way, the creator's own options still bind.
  const privateOnly = info(["SELF_ONLY"]);
  const narrowed = resolvePrivacy("PUBLIC_TO_EVERYONE", privateOnly);
  ok("a creator who can't go public never does", narrowed.level === "SELF_ONLY");

  const noOptions = resolvePrivacy(undefined, info([]));
  ok("an empty options list falls back to private", noOptions.level === "SELF_ONLY");
}

console.log("\n— captions —");
{
  ok("an empty caption is refused", validateCaption("   ") !== null);
  ok("a normal caption passes", validateCaption("New boots, in stock now") === null);
  const tooLong = "a".repeat(TIKTOK_VIDEO_LIMITS.maxCaptionChars + 1);
  ok("an over-long caption is refused before upload", validateCaption(tooLong) !== null);
}

console.log("\n— TikTok handles —");
{
  ok("an @ is stripped", normalizeHandle("@MarlowBakery") === "marlowbakery");
  ok("a good handle passes", handleProblem("marlow_bakery.uk") === null);
  ok("one character is too short", handleProblem("a") !== null);
  ok("spaces are refused", handleProblem("marlow bakery") !== null);
  ok("a trailing full stop is refused", handleProblem("marlow.") !== null);
  ok("blank is not an error — it's optional", handleProblem("") === null);
}

console.log("\n— Starter does not include either TikTok extra —");
{
  const starter = DEFAULT_ENTITLEMENTS.STARTER;
  ok("Starter: no TikTok ads", !starter.tiktok_ads);
  ok("Starter: MAIRO does not set up TikTok", !starter.tiktok_account_setup);
  ok("Starter: MAIRO does not post to TikTok", !starter.tiktok_organic_posting);
  ok("Starter still has Meta", starter.meta_ads);

  const growth = DEFAULT_ENTITLEMENTS.GROWTH;
  ok("Growth: setup yes", growth.tiktok_account_setup);
  ok("Growth: posting yes", growth.tiktok_organic_posting);

  ok("Pro keeps both", DEFAULT_ENTITLEMENTS.SCALE.tiktok_account_setup && DEFAULT_ENTITLEMENTS.SCALE.tiktok_organic_posting);
  ok(
    "an account with no plan has neither",
    !DEFAULT_ENTITLEMENTS.NONE.tiktok_account_setup &&
      !DEFAULT_ENTITLEMENTS.NONE.tiktok_organic_posting
  );
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
