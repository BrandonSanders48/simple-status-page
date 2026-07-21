const STORAGE_KEY = "statuspage_subscriber_contact";

/** Remembers the visitor's own contact info (an email address OR a phone number -
 * whichever they last subscribed/looked up with) across the Subscribe and Manage
 * Subscriptions modals (and future visits) so they don't have to retype it just to
 * check what they're currently subscribed to. Client-side only, best-effort: falls
 * back to an empty string wherever localStorage isn't available (SSR, private
 * browsing, etc). Named "SubscriberEmail" for historical reasons (this predates
 * phone subscriptions) - the value itself may be either. */
export function getSavedSubscriberEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSubscriberEmail(contact: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, contact);
  } catch {
    // Ignore -- storage disabled/unavailable shouldn't break the form.
  }
}
