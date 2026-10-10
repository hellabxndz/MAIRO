import { AmbientSky } from "@/components/ambient-sky";
import { Wordmark } from "@/components/wordmark";
import { brandFont } from "@/lib/fonts";

// The backdrop and the wordmark for sign-in and sign-up. Each page draws its
// own card (AuthCard), so sign-up can set what happens next beside its form.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${brandFont.className} relative flex min-h-screen items-center justify-center px-4 py-12 sm:py-16`}>
      <AmbientSky />
      <div className="relative w-full max-w-[960px]">
        <div className="mb-8 text-center">
          <Wordmark />
        </div>
        {children}
      </div>
    </div>
  );
}
