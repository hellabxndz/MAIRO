import { z } from "zod";

export const PERSONALITIES = ["professional", "friendly", "luxury", "casual", "energetic", "minimal"] as const;
export const FORMALITY = ["casual", "balanced", "formal"] as const;
export const SALES_APPROACH = ["helpful_only", "gentle", "proactive"] as const;
export const SERVICE_APPROACH = ["concise", "warm", "thorough"] as const;
export const BUBBLE_POSITIONS = ["bottom-right", "bottom-left"] as const;

/**
 * The configuration an owner edits for their AI employee. Stored as JSON in
 * ai_employees.draft_config and snapshotted into ai_employee_versions when
 * published. Always parse through this schema — never trust stored JSON.
 */
export const aiEmployeeConfigSchema = z.object({
  welcomeMessage: z.string().trim().max(300).default("Hey! Need help finding something? I'm here to help."),
  personality: z.enum(PERSONALITIES).default("friendly"),
  communicationStyle: z.string().trim().max(300).default(""),
  formality: z.enum(FORMALITY).default("balanced"),
  salesApproach: z.enum(SALES_APPROACH).default("gentle"),
  serviceApproach: z.enum(SERVICE_APPROACH).default("warm"),
  escalation: z
    .object({
      offerHumanWhenUpset: z.boolean().default(true),
      escalateOnRequest: z.boolean().default(true),
      notes: z.string().trim().max(500).default(""),
    })
    .default({ offerHumanWhenUpset: true, escalateOnRequest: true, notes: "" }),
  instructions: z.string().trim().max(4000).default(""),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#7c5cff"),
  bubblePosition: z.enum(BUBBLE_POSITIONS).default("bottom-right"),
  logoUrl: z.url({ protocol: /^https$/ }).max(2048).optional(),
});

export type AiEmployeeConfig = z.infer<typeof aiEmployeeConfigSchema>;

export function parseAiConfig(raw: unknown): AiEmployeeConfig {
  const parsed = aiEmployeeConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : aiEmployeeConfigSchema.parse({});
}
