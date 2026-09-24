import type { z } from "zod";

/** Result returned by form Server Actions to the client. */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

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
