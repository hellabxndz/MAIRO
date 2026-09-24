"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-danger/25 bg-danger/5 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">Something went wrong loading this page</p>
        <p className="text-sm text-fg-muted">Your data is safe. Try again, and if it keeps happening, contact support.</p>
      </div>
      <Button variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
