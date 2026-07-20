export const PLACEHOLDER_INITIAL_DELAY_MS = 2000;
export const PLACEHOLDER_TYPE_INTERVAL_MS = 45;
export const PLACEHOLDER_ALT_HOLD_MS = 3000;

export const REGULAR_TIME_LIMIT_PLACEHOLDERS = {
  defaultPlaceholder: "Enter website...",
  alternatePlaceholder: "Or leave blank to set browsing limit..."
} as const;

export const PRIVATE_TIME_LIMIT_PLACEHOLDERS = {
  defaultPlaceholder: "Enter private-window website...",
  alternatePlaceholder: "Or leave blank to set private browsing limit..."
} as const;

export function getTimeLimitPlaceholders(privateMode: boolean): {
  defaultPlaceholder: string;
  alternatePlaceholder: string;
} {
  return privateMode ? PRIVATE_TIME_LIMIT_PLACEHOLDERS : REGULAR_TIME_LIMIT_PLACEHOLDERS;
}

export function typedPlaceholderAtElapsed(
  elapsedMs: number,
  defaultPlaceholder: string,
  alternatePlaceholder: string,
  reducedMotion = false
): string {
  const safeElapsed = Math.max(0, elapsedMs);

  if (safeElapsed < PLACEHOLDER_INITIAL_DELAY_MS) {
    return defaultPlaceholder;
  }

  if (reducedMotion) {
    return alternatePlaceholder;
  }

  const typingElapsed = safeElapsed - PLACEHOLDER_INITIAL_DELAY_MS;
  const typedCharacters = Math.min(
    alternatePlaceholder.length,
    Math.floor(typingElapsed / PLACEHOLDER_TYPE_INTERVAL_MS) + 1
  );

  return alternatePlaceholder.slice(0, typedCharacters);
}
