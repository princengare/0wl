import type { Browser } from "wxt/browser";
import { BLOCKED_PAGE_PATH, MANAGED_RULE_ID_MIN, MANAGED_RULE_ID_SPAN } from "@/shared/constants";
import { browser as extensionBrowser } from "@/shared/browser";
import type { WindowScope } from "@/shared/types";

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

export function buildBlockedPageUrl(domain: string, windowScope: WindowScope = "regular"): string {
  const url = new URL(
    extensionBrowser.runtime.getURL(BLOCKED_PAGE_PATH as Parameters<typeof extensionBrowser.runtime.getURL>[0])
  );
  url.searchParams.set("domain", domain);
  url.searchParams.set("scope", windowScope);
  return url.toString();
}

export function buildDynamicBlockRule(domain: string): Browser.declarativeNetRequest.Rule {
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
