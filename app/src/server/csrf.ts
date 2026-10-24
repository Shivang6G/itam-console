/**
 * Browser-side CSRF defence for state-changing requests (POST/PUT/PATCH/DELETE).
 * Cookies are SameSite=Lax already; this is a second, independent layer.
 * Pure function so it can be unit tested.
 */
export function isCrossSiteWrite(opts: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  allowedOrigin: string;
}): boolean {
  const m = opts.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (opts.origin) return opts.origin !== opts.allowedOrigin;
  // No Origin header: accept only if the browser says it is same-origin / direct navigation.
  if (opts.secFetchSite) return !["same-origin", "none"].includes(opts.secFetchSite);
  return false; // non-browser client (curl, health checks): no ambient cookies to ride on
}
