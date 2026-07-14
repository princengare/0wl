import { normalizeDomain } from "@/shared/domain";
import { DomainClassificationStore } from "./DomainClassificationStore";
import { SEED_DOMAIN_CLASSIFICATION_COUNT, SEED_DOMAIN_CLASSIFICATIONS } from "./seedDomains";
import type { DomainCategory, DomainClassification } from "../types";

const seedByDomain = new Map(
  SEED_DOMAIN_CLASSIFICATIONS.map((classification) => [classification.domain, classification])
);

export class DomainClassifier {
  constructor(private readonly store = new DomainClassificationStore()) {}

  get seedCount(): number {
    return SEED_DOMAIN_CLASSIFICATION_COUNT;
  }

  getSeedClassification(domainInput: string): DomainClassification | null {
    try {
      return seedByDomain.get(normalizeDomain(domainInput)) ?? null;
    } catch {
      return null;
    }
  }

  async classify(domainInput: string): Promise<DomainClassification | null> {
    const domain = normalizeDomain(domainInput);
    const userClassifications = await this.store.listUserClassifications();
    return (
      userClassifications.find((classification) => classification.domain === domain) ??
      seedByDomain.get(domain) ??
      null
    );
  }

  async classifyMany(domains: string[]): Promise<Map<string, DomainClassification | null>> {
    const normalizedDomains = [...new Set(domains.map((domain) => normalizeDomain(domain)))];
    const userClassifications = await this.store.listUserClassifications();
    const userByDomain = new Map(
      userClassifications.map((classification) => [classification.domain, classification])
    );
    const classifications = new Map<string, DomainClassification | null>();

    for (const domain of normalizedDomains) {
      classifications.set(domain, userByDomain.get(domain) ?? seedByDomain.get(domain) ?? null);
    }

    return classifications;
  }

  async listClassifiedDomains(visitedDomains: string[] = []): Promise<DomainClassification[]> {
    const userClassifications = await this.store.listUserClassifications();
    const userDomains = new Set(userClassifications.map((classification) => classification.domain));
    const visited = new Set(
      visitedDomains.map((domain) => normalizeDomain(domain)).filter((domain) => domain.length > 0)
    );
    const seedMatches = SEED_DOMAIN_CLASSIFICATIONS.filter(
      (classification) =>
        visited.has(classification.domain) || userDomains.has(classification.domain)
    );
    const byDomain = new Map<string, DomainClassification>();

    for (const classification of seedMatches) {
      byDomain.set(classification.domain, classification);
    }

    for (const classification of userClassifications) {
      byDomain.set(classification.domain, classification);
    }

    return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }

  async listUnclassifiedDomains(visitedDomains: string[]): Promise<string[]> {
    const classifications = await this.classifyMany(visitedDomains);
    return [...classifications.entries()]
      .filter(([, classification]) => classification === null)
      .map(([domain]) => domain)
      .sort((a, b) => a.localeCompare(b));
  }

  async setUserClassification(
    domain: string,
    primaryCategory: DomainCategory,
    secondaryCategories: DomainCategory[] = []
  ): Promise<DomainClassification> {
    return this.store.setUserClassification(domain, primaryCategory, secondaryCategories);
  }

  async resetUserClassification(domain: string): Promise<void> {
    await this.store.resetUserClassification(domain);
  }
}
