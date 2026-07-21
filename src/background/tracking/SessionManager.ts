import {
  MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS,
  MIN_VALID_SESSION_DURATION_MS
} from "@/shared/constants";
import { getDateKey } from "@/shared/time";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { EndReason, PersistedTrackingState, StartReason, UsageSession } from "@/shared/types";
import type { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { TransitionRecorder } from "@/vision/transitions/TransitionRecorder";

function createSessionId(domain: string, startedAt: number, endedAt: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${domain}-${startedAt}-${endedAt}`;
}

export class SessionManager {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly dailyUsageRepository: DailyUsageRepository,
    private readonly transitionRecorder?: TransitionRecorder
  ) {}

  async closeSession(
    state: PersistedTrackingState,
    endedAt: number,
    endReason: EndReason,
    startReason: StartReason
  ): Promise<UsageSession | null> {
    if (state.status !== "tracking" || !state.domain || state.sessionStartedAt === null) {
      return null;
    }

    const durationMs = endedAt - state.sessionStartedAt;

    if (
      !Number.isFinite(durationMs) ||
      durationMs < MIN_VALID_SESSION_DURATION_MS ||
      durationMs >= MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS
    ) {
      return null;
    }

    const session: UsageSession = {
      id: createSessionId(state.domain, state.sessionStartedAt, endedAt),
      domain: state.domain,
      windowScope: normalizeWindowScope(state.windowScope),
      usageMode: "active",
      startedAt: state.sessionStartedAt,
      endedAt,
      durationMs,
      startReason,
      endReason,
      dateKey: getDateKey(state.sessionStartedAt),
      createdAt: endedAt
    };

    await this.sessionRepository.add(session);
    await this.dailyUsageRepository.addSession(session);
    await this.transitionRecorder?.recordForSession(session);
    return session;
  }
}
