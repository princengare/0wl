import { findEnabledBlockedDomain } from "./BlockedDomainMatcher";
import type { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import type { SettingsStore } from "@/storage/SettingsStore";
import { getDateKey } from "@/shared/time";
import { normalizeDomain } from "@/shared/domain";
import type { BlockAttempt } from "@/shared/types";

export class BlockAttemptRecorder {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly blockAttemptRepository: BlockAttemptRepository,
    private readonly now: () => number = Date.now
  ) {}

  async recordNavigationAttempt(input: string): Promise<BlockAttempt> {
    const now = this.now();
    const domain = normalizeDomain(input);
    const enabledBlockedDomains = await this.settingsStore.getEnabledBlockedDomains(now);
    const blockedDomain = findEnabledBlockedDomain(domain, enabledBlockedDomains, now);

    if (!blockedDomain) {
      throw new Error("Blocked attempt ignored because the domain is not currently blocked.");
    }

    return this.blockAttemptRepository.recordNavigationAttempt(domain, now);
  }

  async countToday(input: string): Promise<number> {
    const domain = normalizeDomain(input);
    return this.blockAttemptRepository.countForDate(domain, getDateKey(this.now()));
  }
}
