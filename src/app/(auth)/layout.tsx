import Link from "next/link";
import { AmbientSky } from "@/components/ambient-sky";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <AmbientSky />
      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-lg font-semibold tracking-tight text-white"
        >
          MAIRO
        </Link>
        <div className="rounded-2xl border border-white/10 bg-paper p-8 shadow-[0_24px_60px_-30px_rgba(18,21,43,0.28)]">
          {children}
        </div>
      </div>
    </div>
  );
}
