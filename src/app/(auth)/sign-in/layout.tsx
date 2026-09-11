import type { Metadata } from "next";

// The page itself is a client component, so its metadata lives here — that is
// the only place Next will read it from. Without this the tab and every search
// result fall back to the site-wide title, which says nothing about the page.
export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to MAIRO.",
};

export default function Layout({ children }: LayoutProps<"/sign-in">) {
  return children;
}
