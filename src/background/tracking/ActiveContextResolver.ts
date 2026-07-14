import { normalizeDomainFromUrl } from "@/shared/domain";
import { browser as extensionBrowser } from "@/shared/browser";
import { isTrackableUrl } from "@/shared/url";
import { queryIdleState } from "@/platform/idleApi";
import type { ActiveBrowserContext, ExtensionSettings } from "@/shared/types";

export class ActiveContextResolver {
  async resolve(settings: ExtensionSettings): Promise<ActiveBrowserContext> {
    const [windows, idleState] = await Promise.all([
      extensionBrowser.windows.getAll({ populate: true, windowTypes: ["normal"] }),
      queryIdleState(settings.idleThresholdSeconds)
    ]);

    const focusedWindow = windows.find((window) => window.focused);
    const activeTab = focusedWindow?.tabs?.find((tab) => tab.active) ?? null;
    const url = activeTab?.url ?? null;
    const domain = url && isTrackableUrl(url) ? normalizeDomainFromUrl(url) : null;
    const ignoredDomains = new Set(settings.ignoredDomains);
    const trackable = Boolean(domain && !ignoredDomains.has(domain));

    return {
      browserFocused: Boolean(focusedWindow),
      idleState,
      activeTabId: activeTab?.id ?? null,
      activeWindowId: focusedWindow?.id ?? null,
      url,
      domain,
      trackable
    };
  }
}
