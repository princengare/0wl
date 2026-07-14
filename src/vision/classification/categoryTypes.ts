import type { DomainCategory } from "../types";

export const PRODUCTIVE_CATEGORIES: DomainCategory[] = ["focus", "coding", "school", "research"];
export const DISTRACTION_CATEGORIES: DomainCategory[] = ["social", "distraction", "entertainment"];
export const BRIDGE_CATEGORIES: DomainCategory[] = ["neutral", "mixed", "communication"];

export function isProductiveCategory(category: DomainCategory | null): boolean {
  return category !== null && PRODUCTIVE_CATEGORIES.includes(category);
}

export function isDistractionCategory(category: DomainCategory | null): boolean {
  return category !== null && DISTRACTION_CATEGORIES.includes(category);
}

export function isBridgeCategory(category: DomainCategory | null): boolean {
  return category !== null && BRIDGE_CATEGORIES.includes(category);
}
