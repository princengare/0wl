import { buildDynamicBlockRule, isManagedRuleId } from "./DynamicRuleBuilder";
import { BLOCK_RULE_ALARM_NAME } from "@/shared/constants";
import { clearAlarm, createAlarm } from "@/platform/alarmsApi";
import { getDynamicRules, updateDynamicRules } from "@/platform/dynamicRulesApi";
import { isScheduleActive, nextScheduleTransition } from "@/shared/schedule";
import type { BlockedDomain } from "@/shared/types";

export class BlockRuleManager {
  async syncDynamicRules(blockedDomains: BlockedDomain[], now = Date.now()): Promise<void> {
    const enabledDomains = blockedDomains
      .filter((blocked) => blocked.enabled && isScheduleActive(blocked.schedule, now))
      .map((blocked) => blocked.domain);
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

  async refreshDynamicRules(blockedDomains: BlockedDomain[], now = Date.now()): Promise<void> {
    await this.syncDynamicRules(blockedDomains, now);
    await this.scheduleNextAlarm(blockedDomains, now);
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
