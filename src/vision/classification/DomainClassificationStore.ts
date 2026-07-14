import { VISION_CLASSIFICATIONS_STORAGE_KEY } from "@/shared/constants";
import { normalizeDomain } from "@/shared/domain";
import { browser as extensionBrowser } from "@/shared/browser";
import { isPlainObject } from "@/shared/validation";
import type { DomainCategory, DomainClassification } from "../types";

type StorageArea = browser.storage.StorageArea;

function isDomainCategory(value: unknown): value is DomainCategory {
  return (
    value === "focus" ||
    value === "coding" ||
    value === "school" ||
    value === "research" ||
    value === "communication" ||
    value === "neutral" ||
    value === "mixed" ||
    value === "entertainment" ||
    value === "social" ||
    value === "distraction"
  );
}

function normalizeClassification(value: unknown): DomainClassification | null {
  if (!isPlainObject(value) || typeof value.domain !== "string") {
    return null;
  }

  if (!isDomainCategory(value.primaryCategory)) {
    return null;
  }

  const secondaryCategories = Array.isArray(value.secondaryCategories)
    ? value.secondaryCategories.filter(isDomainCategory)
    : [];

  try {
    const domain = normalizeDomain(value.domain);

    return {
      domain,
      primaryCategory: value.primaryCategory,
      secondaryCategories,
      source: "user",
      confidence: typeof value.confidence === "number" ? value.confidence : 1,
      createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now()
    };
  } catch {
    return null;
  }
}

export class DomainClassificationStore {
  constructor(private readonly storageArea: StorageArea = extensionBrowser.storage.local) {}

  async listUserClassifications(): Promise<DomainClassification[]> {
    const result = (await this.storageArea.get(VISION_CLASSIFICATIONS_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const value = result[VISION_CLASSIFICATIONS_STORAGE_KEY];

    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const classifications: DomainClassification[] = [];

    for (const candidate of value) {
      const classification = normalizeClassification(candidate);

      if (!classification || seen.has(classification.domain)) {
        continue;
      }

      classifications.push(classification);
      seen.add(classification.domain);
    }

    return classifications.sort((a, b) => a.domain.localeCompare(b.domain));
  }

  async setUserClassification(
    domainInput: string,
    primaryCategory: DomainCategory,
    secondaryCategories: DomainCategory[] = [],
    now = Date.now()
  ): Promise<DomainClassification> {
    const domain = normalizeDomain(domainInput);
    const current = await this.listUserClassifications();
    const existing = current.find((classification) => classification.domain === domain);
    const next: DomainClassification = {
      domain,
      primaryCategory,
      secondaryCategories: secondaryCategories.filter((category) => category !== primaryCategory),
      source: "user",
      confidence: 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const updated = [
      ...current.filter((classification) => classification.domain !== domain),
      next
    ].sort((a, b) => a.domain.localeCompare(b.domain));

    await this.storageArea.set({ [VISION_CLASSIFICATIONS_STORAGE_KEY]: updated });
    return next;
  }

  async resetUserClassification(domainInput: string): Promise<void> {
    const domain = normalizeDomain(domainInput);
    const current = await this.listUserClassifications();
    await this.storageArea.set({
      [VISION_CLASSIFICATIONS_STORAGE_KEY]: current.filter(
        (classification) => classification.domain !== domain
      )
    });
  }
}
