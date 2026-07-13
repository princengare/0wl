import { normalizeDomain } from "@/shared/domain";
import { isScheduleActive } from "@/shared/schedule";
import type { BlockedDomain } from "@/shared/types";

export function findEnabledBlockedDomain(
  input: string,
  blockedDomains: BlockedDomain[],
  now = Date.now()
): BlockedDomain | null {
  const domain = normalizeDomain(input);
  return (
    blockedDomains.find(
      (blocked) =>
        blocked.enabled && blocked.domain === domain && isScheduleActive(blocked.schedule, now)
    ) ?? null
  );
}

export function isDomainBlocked(
  input: string,
  blockedDomains: BlockedDomain[],
  now = Date.now()
): boolean {
  return Boolean(findEnabledBlockedDomain(input, blockedDomains, now));
}
