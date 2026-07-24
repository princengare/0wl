import type { Browser } from "wxt/browser";
import {
  TIME_LIMIT_PAGE_PATH,
  TIME_LIMIT_RULE_ID_MIN,
  TIME_LIMIT_RULE_ID_SPAN
} from "@/shared/constants";
import { stableRuleIdForDomain } from "@/background/blocking/DynamicRuleBuilder";
import { browser as extensionBrowser } from "@/shared/browser";
import type { TimeLimitedDomain, WindowScope } from "@/shared/types";

export function stableTimeLimitRuleIdForDomain(domain: string): number {
  return stableRuleIdForDomain(domain, TIME_LIMIT_RULE_ID_MIN, TIME_LIMIT_RULE_ID_SPAN);
}

export function isManagedTimeLimitRuleId(ruleId: number): boolean {
  return (
    ruleId >= TIME_LIMIT_RULE_ID_MIN && ruleId < TIME_LIMIT_RULE_ID_MIN + TIME_LIMIT_RULE_ID_SPAN
  );
}

export function buildTimeLimitPageUrl(
  limit: string | Pick<TimeLimitedDomain, "domain" | "targetType" | "windowScope">,
  returnUrl?: string
): string {
  const url = new URL(
    extensionBrowser.runtime.getURL(
      TIME_LIMIT_PAGE_PATH as Parameters<typeof extensionBrowser.runtime.getURL>[0]
    )
  );
  const target =
    typeof limit === "string"
      ? { domain: limit, targetType: "domain" as const, windowScope: "regular" as WindowScope }
      : limit;

  url.searchParams.set("target", target.targetType);
  url.searchParams.set("scope", target.windowScope);

  if (target.domain) {
    url.searchParams.set("domain", target.domain);
  }

  if (returnUrl) {
    url.searchParams.set("returnUrl", returnUrl);
  }

  return url.toString();
}

export function buildScheduledBreakPageUrl(
  windowScope: WindowScope,
  breakActiveUntil: number | null,
  returnUrl?: string
): string {
  const url = new URL(
    extensionBrowser.runtime.getURL(
      TIME_LIMIT_PAGE_PATH as Parameters<typeof extensionBrowser.runtime.getURL>[0]
    )
  );

  url.searchParams.set("target", "break");
  url.searchParams.set("scope", windowScope);

  if (breakActiveUntil !== null) {
    url.searchParams.set("breakUntil", String(breakActiveUntil));
  }

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
