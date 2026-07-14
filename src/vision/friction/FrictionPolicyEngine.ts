import type { FrictionLevel, VisionFrictionRule, VisionSettings } from "../types";

export class FrictionPolicyEngine {
  levelForDomain(domain: string, settings: VisionSettings): FrictionLevel {
    return (
      settings.frictionRules.find((rule) => rule.enabled && rule.domain === domain)?.level ?? 0
    );
  }

  canApplyAutomatically(rule: VisionFrictionRule, settings: VisionSettings): boolean {
    return (
      settings.adaptiveEnforcementEnabled &&
      rule.level <= settings.maxAutomaticFrictionLevel &&
      !settings.excludedAdaptiveDomains.includes(rule.domain)
    );
  }
}
