import { runServiceChecks } from "./lib/checks/runner";
import { invalidateStatusCache } from "./lib/statusCache";
import { notifyTransitions } from "./lib/notifier";

const g = globalThis as unknown as { __statusPageScheduler?: boolean };

if (!g.__statusPageScheduler) {
  g.__statusPageScheduler = true;

  const CHECK_INTERVAL_MS = 2 * 60 * 1000;

  const cycle = async () => {
    try {
      const { transitions } = await runServiceChecks();
      invalidateStatusCache();
      if (transitions.length > 0) {
        await notifyTransitions(transitions);
      }
    } catch (err) {
      console.error("[scheduler] check cycle failed", err);
    }
  };

  setInterval(cycle, CHECK_INTERVAL_MS);
  // Run once shortly after boot so a freshly-started container doesn't wait a full
  // interval before service_status/outage data exists.
  setTimeout(cycle, 5000);
}
