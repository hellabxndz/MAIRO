import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="galaxy-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="space-y-2">
        <p className="text-5xl font-semibold text-gradient">404</p>
        <p className="text-fg-muted">This page doesn&apos;t exist.</p>
      </div>
      <ButtonLink href="/" variant="secondary">Back home</ButtonLink>
    </div>
  );
}
