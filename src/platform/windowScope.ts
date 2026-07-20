import { browser } from "@/shared/browser";
import type { ExtensionSettings, WindowScope } from "@/shared/types";

type MaybeScoped = {
  incognito?: boolean;
  windowScope?: WindowScope | null;
};

type IncognitoAccessApi = {
  extension?: {
    isAllowedIncognitoAccess?: () => Promise<boolean>;
  };
};

export type PrivateWindowAccessStatus = "allowed" | "not-allowed" | "unknown";

export function normalizeWindowScope(value: unknown): WindowScope {
  return value === "private" ? "private" : "regular";
}

export function windowScopeFromIncognito(incognito: unknown): WindowScope {
  return incognito === true ? "private" : "regular";
}

export function windowScopeFromTab(tab: MaybeScoped | null | undefined): WindowScope {
  if (tab?.windowScope) {
    return normalizeWindowScope(tab.windowScope);
  }

  return windowScopeFromIncognito(tab?.incognito);
}

export function isScopeAllowedBySettings(
  settings: Pick<ExtensionSettings, "privateBrowserTrackingEnabled">,
  windowScope: WindowScope
): boolean {
  return windowScope === "regular" || settings.privateBrowserTrackingEnabled;
}

export async function getPrivateWindowAccessStatus(): Promise<PrivateWindowAccessStatus> {
  const api = browser as unknown as IncognitoAccessApi;
  const checkAccess = api.extension?.isAllowedIncognitoAccess;

  if (typeof checkAccess !== "function") {
    return "unknown";
  }

  try {
    return (await checkAccess()) ? "allowed" : "not-allowed";
  } catch {
    return "unknown";
  }
}
