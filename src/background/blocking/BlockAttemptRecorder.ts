import { findEnabledBlockedDomain } from "./BlockedDomainMatcher";
import type { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import type { SettingsStore } from "@/storage/SettingsStore";
import { getDateKey } from "@/shared/time";
import { normalizeDomain } from "@/shared/domain";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { BlockAttempt, WindowScope } from "@/shared/types";

export class BlockAttemptRecorder {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly blockAttemptRepository: BlockAttemptRepository,
    private readonly now: () => number = Date.now
  ) {}

  async recordNavigationAttempt(
    input: string,
    windowScopeInput: WindowScope = "regular"
  ): Promise<BlockAttempt> {
    const now = this.now();
    const domain = normalizeDomain(input);
    const windowScope = normalizeWindowScope(windowScopeInput);
    const enabledBlockedDomains = await this.settingsStore.getEnabledBlockedDomains(
      now,
      windowScope
    );
    const blockedDomain = findEnabledBlockedDomain(domain, enabledBlockedDomains, now, windowScope);

    if (!blockedDomain) {
      throw new Error("Blocked attempt ignored because the domain is not currently blocked.");
    }

    return this.blockAttemptRepository.recordNavigationAttempt(domain, now, windowScope);
  }

  async countToday(input: string, windowScopeInput: WindowScope = "regular"): Promise<number> {
    const domain = normalizeDomain(input);
    return this.blockAttemptRepository.countForDate(
      domain,
      getDateKey(this.now()),
      normalizeWindowScope(windowScopeInput)
    );
  }
}
