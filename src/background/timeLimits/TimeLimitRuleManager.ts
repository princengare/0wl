import { buildTimeLimitRule, isManagedTimeLimitRuleId } from "./TimeLimitRuleBuilder";
import { getDynamicRules, updateDynamicRules } from "@/platform/dynamicRulesApi";

export class TimeLimitRuleManager {
  async syncDynamicRules(exceededDomains: string[]): Promise<void> {
    const desiredRules = exceededDomains.map((domain) => buildTimeLimitRule(domain));
    const existingRules = await getDynamicRules();
    const managedRuleIds = existingRules
      .map((rule) => rule.id)
      .filter((ruleId) => isManagedTimeLimitRuleId(ruleId));

    await updateDynamicRules({
      removeRuleIds: managedRuleIds,
      addRules: desiredRules
    });
  }
}
