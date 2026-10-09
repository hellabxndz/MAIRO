"use client";

import { useFormStatus } from "react-dom";

// A form's submit button that can't be pressed twice: disabled, and saying
// what it's doing, while the request is in flight. The server guards the
// same thing (see draftFromApprovedPlan); this keeps the second press from
// being sent at all.

export function PendingButton({ children, pendingText, className }: { children: React.ReactNode; pendingText: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
