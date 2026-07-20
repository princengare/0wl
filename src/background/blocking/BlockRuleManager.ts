import { buildDynamicBlockRule, isManagedRuleId } from "./DynamicRuleBuilder";
import { buildBlockedPageUrl } from "./DynamicRuleBuilder";
import { BLOCK_RULE_ALARM_NAME } from "@/shared/constants";
import { clearAlarm, createAlarm } from "@/platform/alarmsApi";
import { getDynamicRules, updateDynamicRules } from "@/platform/dynamicRulesApi";
import { isScheduleActive, nextScheduleTransition } from "@/shared/schedule";
import { normalizeDomainFromUrl } from "@/shared/domain";
import { browser } from "@/shared/browser";
import { isTrackableUrl } from "@/shared/url";
import {
  isScopeAllowedBySettings,
  normalizeWindowScope,
  windowScopeFromTab
} from "@/platform/windowScope";
import type { BlockedDomain, ExtensionSettings, WindowScope } from "@/shared/types";

type QueryableTabsApi = typeof browser.tabs & {
  query?: (queryInfo: Record<string, unknown>) => Promise<browser.tabs.Tab[]>;
  update?: typeof browser.tabs.update;
};

export class BlockRuleManager {
  async syncDynamicRules(
    blockedDomains: BlockedDomain[],
    now = Date.now(),
    privateBrowserTrackingEnabled = false
  ): Promise<void> {
    const domainsByScope = new Map<string, Set<WindowScope>>();

    for (const blocked of blockedDomains) {
      const windowScope = normalizeWindowScope(blocked.windowScope);

      if (
        !blocked.enabled ||
        !isScheduleActive(blocked.schedule, now) ||
        (windowScope === "private" && !privateBrowserTrackingEnabled)
      ) {
        continue;
      }

      const scopes = domainsByScope.get(blocked.domain) ?? new Set<WindowScope>();
      scopes.add(windowScope);
      domainsByScope.set(blocked.domain, scopes);
    }

    const enabledDomains = [...domainsByScope.entries()]
      .filter(
        ([, scopes]) =>
          privateBrowserTrackingEnabled && scopes.has("regular") && scopes.has("private")
      )
      .map(([domain]) => domain);
    const desiredRules = enabledDomains.map((domain) => buildDynamicBlockRule(domain));
    const existingRules = await getDynamicRules();
    const managedRuleIds = existingRules
      .map((rule) => rule.id)
      .filter((ruleId) => isManagedRuleId(ruleId));

    await updateDynamicRules({
      removeRuleIds: managedRuleIds,
      addRules: desiredRules
    });
  }

  async refreshDynamicRules(
    blockedDomains: BlockedDomain[],
    now = Date.now(),
    privateBrowserTrackingEnabled = false
  ): Promise<void> {
    await this.syncDynamicRules(blockedDomains, now, privateBrowserTrackingEnabled);
    await this.scheduleNextAlarm(blockedDomains, now);
  }

  async enforceMatchingTabs(
    settings: ExtensionSettings,
    change: { domain?: string; windowScope?: WindowScope } = {},
    now = Date.now()
  ): Promise<void> {
    const tabsApi = browser.tabs as QueryableTabsApi;

    if (typeof tabsApi.query !== "function" || typeof tabsApi.update !== "function") {
      return;
    }

    const activeBlockedDomains = settings.blockedDomains.filter(
      (blocked) =>
        blocked.enabled &&
        isScheduleActive(blocked.schedule, now) &&
        (!change.domain || blocked.domain === change.domain) &&
        (!change.windowScope || normalizeWindowScope(blocked.windowScope) === change.windowScope) &&
        isScopeAllowedBySettings(settings, normalizeWindowScope(blocked.windowScope))
    );

    if (activeBlockedDomains.length === 0) {
      return;
    }

    const tabs = await tabsApi.query({});

    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id === undefined || !tab.url || !isTrackableUrl(tab.url)) {
          return;
        }

        const windowScope = windowScopeFromTab(tab);
        const domain = normalizeDomainFromUrl(tab.url);

        if (!domain) {
          return;
        }

        const blocked = activeBlockedDomains.find(
          (candidate) =>
            candidate.domain === domain &&
            normalizeWindowScope(candidate.windowScope) === windowScope
        );

        if (!blocked) {
          return;
        }

        await tabsApi.update?.(tab.id, {
          url: buildBlockedPageUrl(blocked.domain, normalizeWindowScope(blocked.windowScope))
        });
      })
    );
  }

  async scheduleNextAlarm(blockedDomains: BlockedDomain[], now = Date.now()): Promise<void> {
    await clearAlarm(BLOCK_RULE_ALARM_NAME);

    const nextAlarmAt = blockedDomains
      .filter((blocked) => blocked.enabled)
      .map((blocked) => nextScheduleTransition(blocked.schedule, now))
      .filter((timestamp): timestamp is number => timestamp !== null && timestamp > now)
      .sort((a, b) => a - b)[0];

    if (nextAlarmAt) {
      createAlarm(BLOCK_RULE_ALARM_NAME, { when: nextAlarmAt });
    }
  }
}
