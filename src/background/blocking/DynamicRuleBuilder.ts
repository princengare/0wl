import { BLOCKED_PAGE_PATH, MANAGED_RULE_ID_MIN, MANAGED_RULE_ID_SPAN } from "@/shared/constants";

export function stableRuleIdForDomain(
  domain: string,
  min = MANAGED_RULE_ID_MIN,
  span = MANAGED_RULE_ID_SPAN
): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < domain.length; index += 1) {
    hash ^= domain.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return min + (Math.abs(hash >>> 0) % span);
}

export function isManagedRuleId(ruleId: number): boolean {
  return ruleId >= MANAGED_RULE_ID_MIN && ruleId < MANAGED_RULE_ID_MIN + MANAGED_RULE_ID_SPAN;
}

export function buildBlockedPageUrl(domain: string): string {
  const url = new URL(browser.runtime.getURL(BLOCKED_PAGE_PATH));
  url.searchParams.set("domain", domain);
  return url.toString();
}

export function buildDynamicBlockRule(domain: string): browser.declarativeNetRequest.Rule {
  return {
    id: stableRuleIdForDomain(domain),
    priority: 2,
    action: {
      type: "redirect",
      redirect: {
        url: buildBlockedPageUrl(domain)
      }
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame"]
    }
  };
}
