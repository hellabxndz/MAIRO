// Limits on the picture workflow.
//
// Deliberately not in the "use server" actions file: every export there
// becomes a callable server action, and constants have no business being
// remote endpoints. The client component imports these for its counters.

/**
 * How many pictures a client can actually run per creative request. Three
 * official images per campaign — enough to test variations against each other
 * without spreading the budget too thin.
 */
export const MAX_FINAL_IMAGES = 3;

/**
 * Revisions are meant to feel unlimited. This is not a product limit, it is a
 * runaway guard: every pass costs real money, and a stuck loop or a bored
 * clicker shouldn't be able to spend without bound.
 */
export const MAX_REVISIONS = 25;
