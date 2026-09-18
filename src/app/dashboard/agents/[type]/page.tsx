import { redirect } from "next/navigation";

// The old per-specialist URLs.
//
// /dashboard/agents/strategist, /creative and /support were three separate
// chats. There is one assistant now, so all three land on it. Kept as a
// redirect rather than deleted because these URLs are in the product's own
// older screens, in the guide, and in whatever anybody bookmarked — and a 404
// on a link the product itself printed is worse than an extra hop.

export default async function LegacyAgentRedirect() {
  redirect("/dashboard/agents");
}
