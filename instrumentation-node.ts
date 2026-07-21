import { runServiceChecks } from "./lib/checks/runner";
import { runSiteChecks } from "./lib/checks/site";
import { invalidateStatusCache } from "./lib/statusCache";
import { runIntegrationHealthChecks, invalidateIntegrationsCache } from "./lib/integrationsCache";
import { notifyTransitions, notifySiteTransitions, notifyIntegrationTransitions } from "./lib/notifier";

const g = globalThis as unknown as { __statusPageScheduler?: boolean };

if (!g.__statusPageScheduler) {
  g.__statusPageScheduler = true;

  const CHECK_INTERVAL_MS = 2 * 60 * 1000;

  const cycle = async () => {
    try {
      const { transitions } = await runServiceChecks();
      const { transitions: siteTransitions } = await runSiteChecks();
      invalidateStatusCache();
      if (transitions.length > 0) {
        await notifyTransitions(transitions);
      }
      if (siteTransitions.length > 0) {
        await notifySiteTransitions(siteTransitions);
      }
    } catch (err) {
      console.error("[scheduler] check cycle failed", err);
    }

    try {
      const { transitions: integrationTransitions } = await runIntegrationHealthChecks();
      invalidateIntegrationsCache();
      if (integrationTransitions.length > 0) {
        await notifyIntegrationTransitions(integrationTransitions);
      }
    } catch (err) {
      console.error("[scheduler] integration check cycle failed", err);
    }
  };

  setInterval(cycle, CHECK_INTERVAL_MS);
  // Run once shortly after boot so a freshly-started container doesn't wait a full
  // interval before service_status/outage data exists.
  setTimeout(cycle, 5000);
}
