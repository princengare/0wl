import { describe, expect, it } from "vitest";
import {
  canDrillIntoHistoryMode,
  DEFAULT_HISTORY_MODE,
  historyModeToScope,
  historyModeToUsageMode,
  toggleHistoryMode
} from "@/shared/historyModes";

describe("history mode selection", () => {
  it("defaults to normal active browsing", () => {
    expect(historyModeToScope(DEFAULT_HISTORY_MODE)).toBe("regular");
    expect(historyModeToUsageMode(DEFAULT_HISTORY_MODE)).toBe("active");
  });

  it("selects normal Picture-in-Picture mode", () => {
    const selection = toggleHistoryMode(DEFAULT_HISTORY_MODE, "pip");

    expect(selection).toEqual({ private: false, mediaMode: "pip" });
  });

  it("selects normal background media mode", () => {
    const selection = toggleHistoryMode(DEFAULT_HISTORY_MODE, "background");

    expect(selection).toEqual({ private: false, mediaMode: "background" });
  });

  it("selects private active browsing mode", () => {
    const selection = toggleHistoryMode(DEFAULT_HISTORY_MODE, "private");

    expect(selection).toEqual({ private: true, mediaMode: "active" });
    expect(historyModeToScope(selection)).toBe("private");
  });

  it("combines private mode with Picture-in-Picture", () => {
    const selection = toggleHistoryMode(
      toggleHistoryMode(DEFAULT_HISTORY_MODE, "private"),
      "pip"
    );

    expect(selection).toEqual({ private: true, mediaMode: "pip" });
  });

  it("combines private mode with background media", () => {
    const selection = toggleHistoryMode(
      toggleHistoryMode(DEFAULT_HISTORY_MODE, "private"),
      "background"
    );

    expect(selection).toEqual({ private: true, mediaMode: "background" });
  });

  it("does not keep Picture-in-Picture and background selected together", () => {
    const pip = toggleHistoryMode(DEFAULT_HISTORY_MODE, "pip");
    const background = toggleHistoryMode(pip, "background");

    expect(background).toEqual({ private: false, mediaMode: "background" });
  });

  it("switches background back to Picture-in-Picture", () => {
    const background = toggleHistoryMode(DEFAULT_HISTORY_MODE, "background");
    const pip = toggleHistoryMode(background, "pip");

    expect(pip).toEqual({ private: false, mediaMode: "pip" });
  });

  it("requires private to be selected before creating a private media combination", () => {
    const pip = toggleHistoryMode(DEFAULT_HISTORY_MODE, "pip");
    const privateAfterPip = toggleHistoryMode(pip, "private");

    expect(privateAfterPip).toEqual({ private: true, mediaMode: "active" });
  });

  it("disables drill-down for private aggregate graphs", () => {
    expect(canDrillIntoHistoryMode({ private: true, mediaMode: "active" })).toBe(false);
    expect(canDrillIntoHistoryMode({ private: false, mediaMode: "active" })).toBe(true);
  });
});
