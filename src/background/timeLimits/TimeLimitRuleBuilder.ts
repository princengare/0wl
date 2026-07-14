import type { Browser } from "wxt/browser";
import {
  TIME_LIMIT_PAGE_PATH,
  TIME_LIMIT_RULE_ID_MIN,
  TIME_LIMIT_RULE_ID_SPAN
} from "@/shared/constants";
import { stableRuleIdForDomain } from "@/background/blocking/DynamicRuleBuilder";
import { browser as extensionBrowser } from "@/shared/browser";

export function stableTimeLimitRuleIdForDomain(domain: string): number {
  return stableRuleIdForDomain(domain, TIME_LIMIT_RULE_ID_MIN, TIME_LIMIT_RULE_ID_SPAN);
}

export function isManagedTimeLimitRuleId(ruleId: number): boolean {
  return (
    ruleId >= TIME_LIMIT_RULE_ID_MIN && ruleId < TIME_LIMIT_RULE_ID_MIN + TIME_LIMIT_RULE_ID_SPAN
  );
}

export function buildTimeLimitPageUrl(domain: string, returnUrl?: string): string {
  const url = new URL(
    extensionBrowser.runtime.getURL(TIME_LIMIT_PAGE_PATH as Parameters<typeof extensionBrowser.runtime.getURL>[0])
  );
  url.searchParams.set("domain", domain);

  if (returnUrl) {
    url.searchParams.set("returnUrl", returnUrl);
  }

  return url.toString();
}

export function buildTimeLimitRule(domain: string): Browser.declarativeNetRequest.Rule {
  return {
    id: stableTimeLimitRuleIdForDomain(domain),
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        url: buildTimeLimitPageUrl(domain)
      }
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame"]
    }
  };
}
