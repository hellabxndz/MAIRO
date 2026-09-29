import { aggregate } from "@/lib/budget/optimizer";
import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";

/** Several campaigns' figures added up, skipping the ones with none. */
export function aggregateMetrics(list: (PlatformMetrics | null)[]): PlatformMetrics {
  const present = list.filter((m): m is PlatformMetrics => m !== null);
  return present.length > 0 ? aggregate(present) : EMPTY_METRICS;
}
