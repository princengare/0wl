import { buildDynamicBlockRule, isManagedRuleId } from "./DynamicRuleBuilder";
import type { BlockedDomain } from "@/shared/types";

export class BlockRuleManager {
  async syncDynamicRules(blockedDomains: BlockedDomain[]): Promise<void> {
    const enabledDomains = blockedDomains
      .filter((blocked) => blocked.enabled)
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
}
