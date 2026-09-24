import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="galaxy-bg relative flex min-h-dvh flex-col">
      <div className="starfield pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center px-5 py-5">
        <Logo />
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
