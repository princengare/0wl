import type { Browser } from "wxt/browser";
import { browser } from "@/shared/browser";
import type { CapabilityStatus } from "./browserTarget";

interface DynamicRulesApiShape {
  getDynamicRules?: () => Promise<Browser.declarativeNetRequest.Rule[]>;
  updateDynamicRules?: (options: {
    removeRuleIds?: number[];
    addRules?: Browser.declarativeNetRequest.Rule[];
  }) => Promise<void>;
}

export interface DynamicRulesResult {
  status: CapabilityStatus;
}

function getDynamicRulesApi(): DynamicRulesApiShape | undefined {
  return (browser as unknown as { declarativeNetRequest?: DynamicRulesApiShape })
    .declarativeNetRequest;
}

export function isDynamicRulesApiSupported(): boolean {
  const api = getDynamicRulesApi();
  return Boolean(api?.getDynamicRules && api.updateDynamicRules);
}

export async function getDynamicRules(): Promise<Browser.declarativeNetRequest.Rule[]> {
  const api = getDynamicRulesApi();

  if (!api?.getDynamicRules) {
    return [];
  }

  try {
    return await api.getDynamicRules();
  } catch {
    return [];
  }
}

export async function updateDynamicRules(options: {
  removeRuleIds?: number[];
  addRules?: Browser.declarativeNetRequest.Rule[];
}): Promise<DynamicRulesResult> {
  const api = getDynamicRulesApi();

  if (!api?.updateDynamicRules) {
    return { status: "unsupported" };
  }

  try {
    await api.updateDynamicRules(options);
    return { status: "supported" };
  } catch {
    return { status: "unsupported" };
  }
}
