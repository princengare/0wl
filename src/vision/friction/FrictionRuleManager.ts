import { buildFrictionRule, isManagedFrictionRuleId } from "./FrictionRuleBuilder";
import { FRICTION_RULE_ALARM_NAME } from "@/shared/constants";
import { clearAlarm, createAlarm } from "@/platform/alarmsApi";
import { getDynamicRules, updateDynamicRules } from "@/platform/dynamicRulesApi";
import { isScheduleActive, nextScheduleTransition } from "@/shared/schedule";
import type { VisionFrictionRule } from "../types";

export class FrictionRuleManager {
  async syncDynamicRules(rules: VisionFrictionRule[], now = Date.now()): Promise<void> {
    const desiredRules = rules
      .filter((rule) => rule.enabled && rule.level > 0 && isScheduleActive(rule.schedule, now))
      .map((rule) => buildFrictionRule(rule.domain, rule.level));
    const existingRules = await getDynamicRules();
    const managedRuleIds = existingRules
      .map((rule) => rule.id)
      .filter((ruleId) => isManagedFrictionRuleId(ruleId));

    await updateDynamicRules({
      removeRuleIds: managedRuleIds,
      addRules: desiredRules
    });
  }

  async refreshDynamicRules(rules: VisionFrictionRule[], now = Date.now()): Promise<void> {
    await this.syncDynamicRules(rules, now);
    await this.scheduleNextAlarm(rules, now);
  }

  async scheduleNextAlarm(rules: VisionFrictionRule[], now = Date.now()): Promise<void> {
    await clearAlarm(FRICTION_RULE_ALARM_NAME);

    const nextAlarmAt = rules
      .filter((rule) => rule.enabled && rule.level > 0)
      .map((rule) => nextScheduleTransition(rule.schedule, now))
      .filter((timestamp): timestamp is number => timestamp !== null && timestamp > now)
      .sort((a, b) => a - b)[0];

    if (nextAlarmAt) {
      createAlarm(FRICTION_RULE_ALARM_NAME, { when: nextAlarmAt });
    }
  }
}
