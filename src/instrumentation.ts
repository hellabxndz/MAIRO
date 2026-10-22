import type { Instrumentation } from "next";
import { reportError } from "@/lib/monitoring/report";

// Every server error Next.js catches — pages, route handlers, server actions,
// the proxy — goes to error monitoring (lib/monitoring/report.ts), which does
// nothing until SENTRY_DSN is set. Only the route pattern, the method and the
// kind of render are passed on, never the request's headers or real path.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportError(error, {
    where: `server ${context.routeType}`,
    route: context.routePath,
    method: request.method,
    tags: { routeType: context.routeType, ...(context.renderSource ? { renderSource: context.renderSource } : {}) },
  });
};
