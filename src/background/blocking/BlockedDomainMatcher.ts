import { normalizeDomain } from "@/shared/domain";
import type { BlockedDomain } from "@/shared/types";

export function findEnabledBlockedDomain(
  input: string,
  blockedDomains: BlockedDomain[]
): BlockedDomain | null {
  const domain = normalizeDomain(input);
  return blockedDomains.find((blocked) => blocked.enabled && blocked.domain === domain) ?? null;
}

export function isDomainBlocked(input: string, blockedDomains: BlockedDomain[]): boolean {
  return Boolean(findEnabledBlockedDomain(input, blockedDomains));
}
