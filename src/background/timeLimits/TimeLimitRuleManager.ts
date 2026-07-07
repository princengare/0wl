import { buildTimeLimitRule, isManagedTimeLimitRuleId } from "./TimeLimitRuleBuilder";

export class TimeLimitRuleManager {
  async syncDynamicRules(exceededDomains: string[]): Promise<void> {
    const desiredRules = exceededDomains.map((domain) => buildTimeLimitRule(domain));
    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    const managedRuleIds = existingRules
      .map((rule) => rule.id)
      .filter((ruleId) => isManagedTimeLimitRuleId(ruleId));

    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: managedRuleIds,
      addRules: desiredRules
    });
  }
}
