import { normalizeDomain } from "@/shared/domain";
import { normalizeWindowScope } from "@/platform/windowScope";
import { isScheduleActive } from "@/shared/schedule";
import type { BlockedDomain, WindowScope } from "@/shared/types";

export function findEnabledBlockedDomain(
  input: string,
  blockedDomains: BlockedDomain[],
  now = Date.now(),
  windowScope?: WindowScope
): BlockedDomain | null {
  const domain = normalizeDomain(input);
  return (
    blockedDomains.find(
      (blocked) =>
        blocked.enabled &&
        blocked.domain === domain &&
        (!windowScope || normalizeWindowScope(blocked.windowScope) === windowScope) &&
        isScheduleActive(blocked.schedule, now)
    ) ?? null
  );
}

export function isDomainBlocked(
  input: string,
  blockedDomains: BlockedDomain[],
  now = Date.now(),
  windowScope?: WindowScope
): boolean {
  return Boolean(findEnabledBlockedDomain(input, blockedDomains, now, windowScope));
}
