import { createStart, createMiddleware } from "@tanstack/react-start";
import { env } from "@/server/env";
import { isCrossSiteWrite } from "@/server/csrf";
import { logger } from "@/server/logger";
import { renderErrorPage } from "./lib/error-page";

const csrfMiddleware = createMiddleware().server(async ({ request, next }) => {
  const allowedOrigin = env().PUBLIC_BASE_URL ? new URL(env().PUBLIC_BASE_URL!).origin : new URL(request.url).origin;
  if (
    isCrossSiteWrite({
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      allowedOrigin,
    })
  ) {
    logger.warn({ method: request.method, url: new URL(request.url).pathname, origin: request.headers.get("origin") }, "csrf_blocked");
    return new Response("Cross-site request blocked", { status: 403 });
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) throw error;
    logger.error({ err: (error as Error)?.message }, "unhandled_request_error");
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
