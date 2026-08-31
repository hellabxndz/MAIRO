import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-lg font-semibold tracking-tight text-white"
        >
          MyRo
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
