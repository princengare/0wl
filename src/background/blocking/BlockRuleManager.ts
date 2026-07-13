import { buildDynamicBlockRule, isManagedRuleId } from "./DynamicRuleBuilder";
import { BLOCK_RULE_ALARM_NAME } from "@/shared/constants";
import { isScheduleActive, nextScheduleTransition } from "@/shared/schedule";
import type { BlockedDomain } from "@/shared/types";

export class BlockRuleManager {
  async syncDynamicRules(blockedDomains: BlockedDomain[], now = Date.now()): Promise<void> {
    const enabledDomains = blockedDomains
      .filter((blocked) => blocked.enabled && isScheduleActive(blocked.schedule, now))
      .map((blocked) => blocked.domain);
    const desiredRules = enabledDomains.map((domain) => buildDynamicBlockRule(domain));
    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    const managedRuleIds = existingRules
      .map((rule) => rule.id)
      .filter((ruleId) => isManagedRuleId(ruleId));

    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: managedRuleIds,
      addRules: desiredRules
    });
  }

  async refreshDynamicRules(blockedDomains: BlockedDomain[], now = Date.now()): Promise<void> {
    await this.syncDynamicRules(blockedDomains, now);
    await this.scheduleNextAlarm(blockedDomains, now);
  }

  async scheduleNextAlarm(blockedDomains: BlockedDomain[], now = Date.now()): Promise<void> {
    await browser.alarms.clear(BLOCK_RULE_ALARM_NAME);

    const nextAlarmAt = blockedDomains
      .filter((blocked) => blocked.enabled)
      .map((blocked) => nextScheduleTransition(blocked.schedule, now))
      .filter((timestamp): timestamp is number => timestamp !== null && timestamp > now)
      .sort((a, b) => a - b)[0];

    if (nextAlarmAt) {
      browser.alarms.create(BLOCK_RULE_ALARM_NAME, { when: nextAlarmAt });
    }
  }
}
