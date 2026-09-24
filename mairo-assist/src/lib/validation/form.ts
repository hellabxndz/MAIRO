import type { z } from "zod";

/** Result returned by form Server Actions to the client. */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
  /** Increments on every submission (see withNonce). */
  nonce?: number;
};

/**
 * React resets uncontrolled fields after a form action, and <select>s snap
 * back to their first default. Wrapping the action adds a counter the form
 * uses as its `key`, so it remounts with the submitted values as defaults.
 */
export function withNonce<S extends FormState>(action: (prev: S, form: FormData) => Promise<S>) {
  return async (prev: S, form: FormData): Promise<S> => ({ ...(await action(prev, form)), nonce: (prev.nonce ?? 0) + 1 });
}

export function fieldErrors(error: z.ZodError): FormState["errors"] {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
