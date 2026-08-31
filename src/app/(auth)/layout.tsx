import Link from "next/link";
import { AiBackground } from "@/components/ai-background";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <AiBackground />
      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-lg font-semibold tracking-tight text-white"
        >
          MAIRO
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_0_60px_-15px_rgba(139,92,246,0.35)] backdrop-blur-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
