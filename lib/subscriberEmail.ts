const STORAGE_KEY = "statuspage_subscriber_email";

/** Remembers the visitor's own email across the Subscribe and Manage Subscriptions
 * modals (and future visits) so they don't have to retype it just to check what
 * they're currently subscribed to. Client-side only, best-effort: falls back to an
 * empty string wherever localStorage isn't available (SSR, private browsing, etc). */
export function getSavedSubscriberEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSubscriberEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, email);
  } catch {
    // Ignore -- storage disabled/unavailable shouldn't break the form.
  }
}
