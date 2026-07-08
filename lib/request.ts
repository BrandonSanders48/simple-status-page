/** True if this specific request arrived over TLS. Used instead of NODE_ENV to decide the
 * Secure cookie flag, since this app serves plain HTTP and HTTPS side by side rather than
 * redirecting one to the other. */
export function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}
