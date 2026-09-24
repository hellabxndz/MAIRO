import { Logo } from "@/components/ui/logo";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="galaxy-bg relative min-h-dvh">
      <div className="starfield pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo href="/dashboard" />
        <form action="/auth/signout" method="post">
          <button className="text-sm text-fg-muted hover:text-fg">Sign out</button>
        </form>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-20">{children}</main>
    </div>
  );
}
