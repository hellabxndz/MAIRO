import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-fg-muted">The AI employee for online stores. A product from the makers of Mairo.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-fg-muted">
          <a href="#features" className="hover:text-fg">Features</a>
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <a href="#pricing" className="hover:text-fg">Pricing</a>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
          <Link href="/login" className="hover:text-fg">Log in</Link>
          <Link href="/signup" className="hover:text-fg">Get Started</Link>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-5 text-xs text-fg-subtle">© {new Date().getFullYear()} Mairo Assist. All rights reserved.</p>
    </footer>
  );
}
