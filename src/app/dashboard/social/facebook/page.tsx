import { SocialPage } from "../social-page";

// Checking the Page and its posting permission are Graph calls, and anything
// due is published on load.
export const maxDuration = 60;

export default function FacebookPostsPage() {
  return <SocialPage network="FACEBOOK" />;
}
