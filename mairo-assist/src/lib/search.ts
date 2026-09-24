/** Escape user input for an ILIKE "contains" pattern. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Quote a value for use inside a PostgREST `or=(...)` filter. */
export function orValue(value: string) {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}
