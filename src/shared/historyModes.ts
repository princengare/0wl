import type { HistoryModeSelection, UsageMode, WindowScope } from "./types";

export type HistoryModeButton = "private" | "pip" | "background";

export const DEFAULT_HISTORY_MODE: HistoryModeSelection = {
  private: false,
  mediaMode: "active"
};

export function toggleHistoryMode(
  current: HistoryModeSelection,
  button: HistoryModeButton
): HistoryModeSelection {
  if (button === "private") {
    const nextPrivate = !current.private;

    return {
      private: nextPrivate,
      mediaMode: nextPrivate && current.mediaMode !== "active" ? "active" : current.mediaMode
    };
  }

  const nextMediaMode: UsageMode = button;

  return {
    ...current,
    mediaMode: current.mediaMode === nextMediaMode ? "active" : nextMediaMode
  };
}

export function historyModeToScope(selection: HistoryModeSelection): WindowScope {
  return selection.private ? "private" : "regular";
}

export function historyModeToUsageMode(selection: HistoryModeSelection): UsageMode {
  return selection.mediaMode;
}

export function canDrillIntoHistoryMode(selection: HistoryModeSelection): boolean {
  return !selection.private;
}

export function historyModeEmptyState(selection: HistoryModeSelection): string {
  if (selection.mediaMode === "pip") {
    return selection.private
      ? "No private Picture-in-Picture history in this range"
      : "No Picture-in-Picture history in this range";
  }

  if (selection.mediaMode === "background") {
    return selection.private
      ? "No private background media history in this range"
      : "No background media history in this range";
  }

  return selection.private
    ? "No private browsing history in this range"
    : "No sessions in this range";
}
