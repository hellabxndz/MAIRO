import { redirect } from "next/navigation";

// The Social section has a page per network; the old address opens Instagram.
export default function SocialIndex() {
  redirect("/dashboard/social/instagram");
}
