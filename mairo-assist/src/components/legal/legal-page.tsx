import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Logo } from "@/components/ui/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="galaxy-bg min-h-dvh">
      <header className="mx-auto max-w-3xl px-5 py-6"><Logo /></header>
      <main className="mx-auto max-w-3xl px-5 pb-20">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-fg-subtle">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-muted [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
