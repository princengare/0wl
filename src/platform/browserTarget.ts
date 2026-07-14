export type BrowserTarget = "chrome" | "firefox" | "edge" | "opera" | "safari" | "unknown";
export type CapabilityStatus = "supported" | "partial" | "unsupported";

export function normalizeBrowserTarget(value: string | undefined): BrowserTarget {
  if (
    value === "chrome" ||
    value === "firefox" ||
    value === "edge" ||
    value === "opera" ||
    value === "safari"
  ) {
    return value;
  }

  return "unknown";
}

export function getBrowserTarget(): BrowserTarget {
  return normalizeBrowserTarget(import.meta.env.BROWSER);
}

export function isSafariTarget(target: BrowserTarget = getBrowserTarget()): boolean {
  return target === "safari";
}
