import { z } from "zod";
import type { ToolDefinition } from "./types";

/**
 * Convert a Zod schema to the JSON Schema OpenAI strict mode accepts. Length
 * and format keywords are dropped from what the model sees — the backend
 * still enforces them with the Zod schema on every call.
 */
export function toToolParameters(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  return strip(json) as Record<string, unknown>;
}

const DROP = new Set(["$schema", "maxLength", "minLength", "pattern", "format", "maxItems", "minItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, strip(v)]),
  );
}

export type ToolSpec<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
};

export function definitionOf(spec: ToolSpec): ToolDefinition {
  return { name: spec.name, description: spec.description, parameters: toToolParameters(spec.schema) };
}

/** Parse model-supplied JSON arguments against a tool's schema. */
export function parseArguments<S extends z.ZodType>(spec: ToolSpec<S>, raw: string): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Arguments were not valid JSON." };
  }
  const parsed = spec.schema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: parsed.data };
}
