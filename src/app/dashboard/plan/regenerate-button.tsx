"use client";

import { useTransition } from "react";
import { secondaryButtonClass } from "@/components/ui";

export function RegenerateButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => action())}
      className={secondaryButtonClass}
    >
      {pending ? "Regenerating..." : "Regenerate plan"}
    </button>
  );
}
