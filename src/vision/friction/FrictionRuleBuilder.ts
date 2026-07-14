import type { Browser } from "wxt/browser";
import {
  FRICTION_PAGE_PATH,
  FRICTION_RULE_ID_MIN,
  FRICTION_RULE_ID_SPAN
} from "@/shared/constants";
import { browser as extensionBrowser } from "@/shared/browser";
import { stableRuleIdForDomain } from "@/background/blocking/DynamicRuleBuilder";
import type { FrictionLevel } from "../types";

export function stableFrictionRuleIdForDomain(domain: string): number {
  return stableRuleIdForDomain(domain, FRICTION_RULE_ID_MIN, FRICTION_RULE_ID_SPAN);
}

export function isManagedFrictionRuleId(ruleId: number): boolean {
  return ruleId >= FRICTION_RULE_ID_MIN && ruleId < FRICTION_RULE_ID_MIN + FRICTION_RULE_ID_SPAN;
}

export function buildFrictionPageUrl(
  domain: string,
  level: FrictionLevel,
  returnUrl?: string
): string {
  const url = new URL(
    extensionBrowser.runtime.getURL(
      FRICTION_PAGE_PATH as Parameters<typeof extensionBrowser.runtime.getURL>[0]
    )
  );
  url.searchParams.set("domain", domain);
  url.searchParams.set("level", String(level));

  if (returnUrl) {
    url.searchParams.set("returnUrl", returnUrl);
  }

  return url.toString();
}

export function buildFrictionRule(
  domain: string,
  level: FrictionLevel
): Browser.declarativeNetRequest.Rule {
  return {
    id: stableFrictionRuleIdForDomain(domain),
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        url: buildFrictionPageUrl(domain, level)
      }
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame"]
    }
  };
}
