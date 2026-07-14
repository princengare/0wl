import {
  getBrowserTarget,
  isSafariTarget,
  type BrowserTarget,
  type CapabilityStatus
} from "./browserTarget";

export interface PlatformCapabilities {
  target: BrowserTarget;
  activeTabTracking: CapabilityStatus;
  browserFocusTracking: CapabilityStatus;
  idleDetection: CapabilityStatus;
  alarms: CapabilityStatus;
  dynamicRules: CapabilityStatus;
  interstitialRedirects: CapabilityStatus;
  localStorage: CapabilityStatus;
  indexedDb: CapabilityStatus;
  visionAnalytics: CapabilityStatus;
  notes: string[];
}

export function getPlatformCapabilities(
  target: BrowserTarget = getBrowserTarget()
): PlatformCapabilities {
  if (isSafariTarget(target)) {
    return {
      target,
      activeTabTracking: "partial",
      browserFocusTracking: "partial",
      idleDetection: "partial",
      alarms: "partial",
      dynamicRules: "partial",
      interstitialRedirects: "partial",
      localStorage: "supported",
      indexedDb: "supported",
      visionAnalytics: "supported",
      notes: [
        "Safari Web Extension assets build through WXT, then require an Xcode app wrapper.",
        "0wl detects idle, alarm, and declarativeNetRequest support at runtime and degrades conservatively if Safari does not expose an API.",
        "Safari extension storage is separate from Firefox, Chrome, Edge, and Opera storage."
      ]
    };
  }

  return {
    target,
    activeTabTracking: "supported",
    browserFocusTracking: "supported",
    idleDetection: "supported",
    alarms: "supported",
    dynamicRules: "supported",
    interstitialRedirects: "supported",
    localStorage: "supported",
    indexedDb: "supported",
    visionAnalytics: "supported",
    notes: []
  };
}
