import { describe, expect, it } from "vitest";
import {
  getTimeLimitPlaceholders,
  PLACEHOLDER_INITIAL_DELAY_MS,
  PLACEHOLDER_TYPE_INTERVAL_MS,
  typedPlaceholderAtElapsed
} from "@/shared/placeholders";

const DEFAULT = "Enter website...";
const ALT = "Or leave blank to set browsing limit...";

describe("typed placeholder timing", () => {
  it("shows the default placeholder before the initial delay", () => {
    expect(typedPlaceholderAtElapsed(PLACEHOLDER_INITIAL_DELAY_MS - 1, DEFAULT, ALT)).toBe(DEFAULT);
  });

  it("types the alternate placeholder after the initial delay", () => {
    expect(typedPlaceholderAtElapsed(PLACEHOLDER_INITIAL_DELAY_MS, DEFAULT, ALT)).toBe("O");
    expect(
      typedPlaceholderAtElapsed(
        PLACEHOLDER_INITIAL_DELAY_MS + 4 * PLACEHOLDER_TYPE_INTERVAL_MS,
        DEFAULT,
        ALT
      )
    ).toBe("Or le");
  });

  it("shows the alternate placeholder immediately for reduced motion", () => {
    expect(typedPlaceholderAtElapsed(PLACEHOLDER_INITIAL_DELAY_MS, DEFAULT, ALT, true)).toBe(ALT);
  });

  it("keeps regular time limit placeholders unchanged", () => {
    expect(getTimeLimitPlaceholders(false)).toEqual({
      defaultPlaceholder: "Enter website...",
      alternatePlaceholder: "Or leave blank to set browsing limit..."
    });
  });

  it("uses private time limit placeholders in private mode", () => {
    expect(getTimeLimitPlaceholders(true)).toEqual({
      defaultPlaceholder: "Enter private-window website...",
      alternatePlaceholder: "Or leave blank to set private browsing limit..."
    });
  });
});
