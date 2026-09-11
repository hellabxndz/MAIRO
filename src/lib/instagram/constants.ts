// Instagram's own limits, in a file with no imports.
//
// Separate from publish.ts so the posting form can read them without pulling
// the database client and the Graph wrapper into the browser bundle — a client
// component importing publish.ts would drag all of it along.

/** Instagram's caption ceiling. */
export const CAPTION_MAX = 2200;

/**
 * Instagram's posting allowance, which is per account rather than per app.
 *
 * Worth showing rather than discovering: an account that has hit it gets a
 * refusal that reads like a permissions problem.
 */
export const POSTS_PER_DAY = 25;
