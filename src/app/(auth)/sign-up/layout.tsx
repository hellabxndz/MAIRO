import type { Metadata } from "next";

// The page's metadata lives here (it predates the page having a server half,
// when the whole page was a client component and this was the only place Next
// would read it from). Without it the tab and every search result fall back to
// the site-wide title, which says nothing about the page.
export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Start running Meta and TikTok ads in a few minutes. No ads manager, no jargon.",
};

export default function Layout({ children }: LayoutProps<"/sign-up">) {
  return children;
}
