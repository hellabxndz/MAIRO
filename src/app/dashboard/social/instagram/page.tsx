import { SocialPage } from "../social-page";

// Reading the Instagram account is a Graph call, and anything due is
// published on load.
export const maxDuration = 60;

export default function InstagramPostsPage() {
  return <SocialPage network="INSTAGRAM" />;
}
