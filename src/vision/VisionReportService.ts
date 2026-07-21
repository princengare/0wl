import type { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { SettingsStore } from "@/storage/SettingsStore";
import { normalizeWindowScope } from "@/platform/windowScope";
import { FocusInterruptionAnalyzer } from "./context/FocusInterruptionAnalyzer";
import { PreDistractionContextAnalyzer } from "./context/PreDistractionContextAnalyzer";
import type { DomainClassifier } from "./classification/DomainClassifier";
import { BlockEvasionDetector } from "./blocking/BlockEvasionDetector";
import { BlockOutcomeAnalyzer } from "./blocking/BlockOutcomeAnalyzer";
import { AttemptChainDetector } from "./pathways/AttemptChainDetector";
import { DistractionPathwayDetector } from "./pathways/DistractionPathwayDetector";
import { sessionDriftsFromPathways } from "./pathways/pathwayAnalytics";
import { RecoveryTimeAnalyzer } from "./recovery/RecoveryTimeAnalyzer";
import { BounceBackAnalyzer } from "./recovery/BounceBackAnalyzer";
import { RecommendationEngine } from "./recommendations/RecommendationEngine";
import { BlockAttemptHeatmapAnalyzer } from "./heatmaps/BlockAttemptHeatmapAnalyzer";
import { SubstitutionDetector } from "./substitution/SubstitutionDetector";
import { NetTimeReclaimedAnalyzer } from "./substitution/NetTimeReclaimedAnalyzer";
import { LongTermTrendAnalyzer } from "./trends/LongTermTrendAnalyzer";
import { PersonalizedInsightGenerator } from "./trends/PersonalizedInsightGenerator";
import {
  transitionsIntoDistraction,
  mostCommonTransitions
} from "./transitions/transitionAnalytics";
import type { TransitionRepository } from "./transitions/TransitionRepository";
import type { VisionSettingsStore } from "./settings/VisionSettingsStore";
import type { VisionReport } from "./types";

export class VisionReportService {
  constructor(
    private readonly dependencies: {
      sessionRepository: SessionRepository;
      blockAttemptRepository: BlockAttemptRepository;
      transitionRepository: TransitionRepository;
      settingsStore: SettingsStore;
      visionSettingsStore: VisionSettingsStore;
      domainClassifier: DomainClassifier;
      now?: () => number;
    }
  ) {}

  async buildReport(): Promise<VisionReport> {
    const now = this.dependencies.now?.() ?? Date.now();
    const [sessions, attempts, transitions, settings, visionSettings] = await Promise.all([
      this.dependencies.sessionRepository.listAll(),
      this.dependencies.blockAttemptRepository.listAll(),
      this.dependencies.transitionRepository.listAll(),
      this.dependencies.settingsStore.get(now),
      this.dependencies.visionSettingsStore.get(now)
    ]);
    const regularSessions = sessions.filter(
      (session) => normalizeWindowScope(session.windowScope) === "regular"
    );
    const regularAttempts = attempts.filter(
      (attempt) => normalizeWindowScope(attempt.windowScope) === "regular"
    );
    const regularSessionIds = new Set(regularSessions.map((session) => session.id));
    const regularTransitions = transitions.filter(
      (transition) =>
        regularSessionIds.has(transition.fromSessionId) &&
        regularSessionIds.has(transition.toSessionId)
    );
    const regularBlockedDomains = settings.blockedDomains.filter(
      (blocked) => normalizeWindowScope(blocked.windowScope) === "regular"
    );
    const visitedDomains = [...new Set(regularSessions.map((session) => session.domain))];
    const classifications = await this.dependencies.domainClassifier.classifyMany(visitedDomains);
    const classifiedDomains =
      await this.dependencies.domainClassifier.listClassifiedDomains(visitedDomains);
    const unclassifiedDomains =
      await this.dependencies.domainClassifier.listUnclassifiedDomains(visitedDomains);
    const pathways = new DistractionPathwayDetector().detect(regularSessions, classifications);
    const attemptChains = new AttemptChainDetector().detect(
      regularAttempts,
      regularSessions,
      classifications
    );
    const contexts = new PreDistractionContextAnalyzer().analyze(regularTransitions);
    const focusInterruptions = new FocusInterruptionAnalyzer().analyze(regularTransitions);
    const recovery = new RecoveryTimeAnalyzer().analyze(regularSessions, classifications, now);
    const heatmap = new BlockAttemptHeatmapAnalyzer().analyze(regularAttempts);
    const blockOutcomes = new BlockOutcomeAnalyzer().analyze(
      regularAttempts,
      regularSessions,
      classifications
    );
    const bounceBackRate = new BounceBackAnalyzer().rate(blockOutcomes);
    const blockEvasions = new BlockEvasionDetector().detect(
      regularAttempts,
      regularSessions,
      classifications
    );
    const substitutions = new SubstitutionDetector().detect(
      regularBlockedDomains,
      regularSessions,
      classifications
    );
    const netTimeReclaimedMsPerDay = new NetTimeReclaimedAnalyzer().total(substitutions);
    const trends = new LongTermTrendAnalyzer().analyze(
      regularSessions,
      regularAttempts,
      classifications,
      focusInterruptions.reduce((sum, row) => sum + row.count, 0),
      now
    );
    const recommendations = new RecommendationEngine().generate({
      heatmap,
      pathways,
      substitutions,
      settings: visionSettings
    });
    const insights = new PersonalizedInsightGenerator().generate({
      contexts,
      pathways,
      recovery,
      outcomes: blockOutcomes,
      substitutions,
      trends
    });

    return {
      generatedAt: now,
      seedClassificationCount: this.dependencies.domainClassifier.seedCount,
      classifiedDomains,
      unclassifiedDomains,
      transitions: mostCommonTransitions(regularTransitions),
      distractionTransitions: transitionsIntoDistraction(regularTransitions),
      focusInterruptions,
      pathways,
      sessionDrifts: sessionDriftsFromPathways(pathways),
      attemptChains,
      blockEvasions,
      contexts,
      recovery,
      heatmap,
      blockOutcomes,
      bounceBackRate,
      substitutions,
      netTimeReclaimedMsPerDay,
      recommendations,
      insights,
      trends,
      settings: visionSettings
    };
  }
}
