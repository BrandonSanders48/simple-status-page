/**
 * Resolves the public base URL of this status page from config, for building
 * absolute links (emails, email-action redirects) that must point at the
 * address subscribers actually browse to -- not whatever Host/proxy the
 * server happens to see on a given request.
 */
export function resolvePageUrl(cfg: { companyUrl: string | null }): string | null {
  return process.env.PAGE_URL || cfg.companyUrl || null;
}
