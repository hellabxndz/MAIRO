/**
 * Minimal structured logger. Strips email addresses and long tokens from
 * messages so logs never carry customer personal data or secrets.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKENISH = /\b(?:shpat|shpua|shpca|sk|sb_secret|rk)_[A-Za-z0-9_-]{8,}\b|\b[A-Za-z0-9_-]{40,}\b/g;

export function redact(value: string) {
  return value.replace(EMAIL, "[email]").replace(TOKENISH, "[redacted]");
}

type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Error) safe[k] = redact(v.message);
    else if (typeof v === "string") safe[k] = redact(v);
    else safe[k] = v;
  }
  const line = JSON.stringify({ level, event, ...safe, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
