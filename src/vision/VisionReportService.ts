import type { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { SettingsStore } from "@/storage/SettingsStore";
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
    const visitedDomains = [...new Set(sessions.map((session) => session.domain))];
    const classifications = await this.dependencies.domainClassifier.classifyMany(visitedDomains);
    const classifiedDomains =
      await this.dependencies.domainClassifier.listClassifiedDomains(visitedDomains);
    const unclassifiedDomains =
      await this.dependencies.domainClassifier.listUnclassifiedDomains(visitedDomains);
    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);
    const attemptChains = new AttemptChainDetector().detect(attempts, sessions, classifications);
    const contexts = new PreDistractionContextAnalyzer().analyze(transitions);
    const focusInterruptions = new FocusInterruptionAnalyzer().analyze(transitions);
    const recovery = new RecoveryTimeAnalyzer().analyze(sessions, classifications, now);
    const heatmap = new BlockAttemptHeatmapAnalyzer().analyze(attempts);
    const blockOutcomes = new BlockOutcomeAnalyzer().analyze(attempts, sessions, classifications);
    const bounceBackRate = new BounceBackAnalyzer().rate(blockOutcomes);
    const blockEvasions = new BlockEvasionDetector().detect(attemptChains);
    const substitutions = new SubstitutionDetector().detect(
      settings.blockedDomains,
      sessions,
      classifications
    );
    const netTimeReclaimedMsPerDay = new NetTimeReclaimedAnalyzer().total(substitutions);
    const trends = new LongTermTrendAnalyzer().analyze(
      sessions,
      attempts,
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
      transitions: mostCommonTransitions(transitions),
      distractionTransitions: transitionsIntoDistraction(transitions),
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
