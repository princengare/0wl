import { getDateKey } from "@/shared/time";
import type { UsageSession } from "@/shared/types";
import type { DomainClassifier } from "../classification/DomainClassifier";
import type { DomainTransition } from "../types";
import type { TransitionRepository } from "./TransitionRepository";

export class TransitionRecorder {
  constructor(
    private readonly repository: TransitionRepository,
    private readonly classifier: DomainClassifier
  ) {}

  async recordForSession(session: UsageSession): Promise<DomainTransition | null> {
    const previous = await this.repository.getPreviousSession(session.startedAt);

    if (!previous || previous.domain === session.domain) {
      return null;
    }

    const gapMs = session.startedAt - previous.endedAt;

    if (!Number.isFinite(gapMs) || gapMs < 0) {
      return null;
    }

    const classifications = await this.classifier.classifyMany([previous.domain, session.domain]);
    const transition: DomainTransition = {
      id: `${previous.id}::${session.id}`,
      fromSessionId: previous.id,
      toSessionId: session.id,
      fromDomain: previous.domain,
      toDomain: session.domain,
      fromCategory: classifications.get(previous.domain)?.primaryCategory ?? null,
      toCategory: classifications.get(session.domain)?.primaryCategory ?? null,
      transitionedAt: session.startedAt,
      gapMs,
      previousSessionDurationMs: previous.durationMs,
      dateKey: getDateKey(session.startedAt)
    };

    await this.repository.add(transition);
    return transition;
  }
}
