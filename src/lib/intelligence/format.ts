import type { BasedOn } from "./types";

/** The figures behind a finding, one line: "7 days of data · 9,421 impressions · 338 clicks · 31 purchases". */
export function basedOnLine(b: BasedOn): string {
  const parts = [`${b.days} day${b.days === 1 ? "" : "s"} of data`];
  if (b.impressions) parts.push(`${b.impressions.toLocaleString("en-US")} impressions`);
  if (b.clicks) parts.push(`${b.clicks.toLocaleString("en-US")} clicks`);
  if (b.results !== null) parts.push(`${b.results.toLocaleString("en-US")} ${b.resultWord}${b.results === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
