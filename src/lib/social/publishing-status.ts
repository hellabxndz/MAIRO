// Whether MAIRO can publish organic posts for customers yet.
//
// Publishing to Instagram and to Facebook Pages is built (each post goes out
// only when the business approves it, or under Social Autopilot once it has
// approved enough), but it needs permissions Meta grants only after App
// Review: instagram_basic, instagram_content_publish and pages_manage_posts.
// Until Meta approves them, only people with a role on MAIRO's Meta app can
// grant them — so for customers, publishing isn't available, and every screen
// and page that mentions it has to say so.
//
// Set META_POSTING_APPROVED=1 once Meta has approved those permissions.

export function metaPostingApproved(): boolean {
  return process.env.META_POSTING_APPROVED?.trim() === "1";
}

export const POSTING_PENDING =
  "Publishing is waiting for Meta's approval. Meta hasn't yet approved the permissions MAIRO needs to post on Instagram and Facebook for you, so MAIRO can't publish posts yet. You can set your goal and plan and write posts now; publishing switches on once Meta approves.";
