"use client";

import { useTransition } from "react";
import { writeLeadFormAction } from "@/lib/actions/lead-actions";
import { primaryButtonClass } from "@/components/ui";

// The only way a form gets written from this screen, and it takes a press.
//
// Creating one on render would be easier and is what this page used to do —
// but the result is a public URL with the customer's business name on it that
// they never asked for, on every account that ever glanced at the page.
export function WriteLeadForm() {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await writeLeadFormAction()))}
      className={primaryButtonClass}
    >
      {pending ? "Writing…" : "Write my form"}
    </button>
  );
}
