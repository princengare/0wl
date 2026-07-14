import { browser } from "@/shared/browser";
import type { ActiveBrowserContext } from "@/shared/types";

type IdleState = ActiveBrowserContext["idleState"];

interface IdleApiShape {
  queryState?: (detectionIntervalInSeconds: number) => Promise<IdleState>;
  setDetectionInterval?: (intervalInSeconds: number) => void;
  onStateChanged?: {
    addListener?: (callback: (newState: IdleState) => void) => void;
  };
}

function getIdleApi(): IdleApiShape | undefined {
  return (browser as unknown as { idle?: IdleApiShape }).idle;
}

export function isIdleApiSupported(): boolean {
  const idle = getIdleApi();
  return Boolean(idle?.queryState && idle.setDetectionInterval && idle.onStateChanged?.addListener);
}

export async function queryIdleState(intervalSeconds: number): Promise<IdleState> {
  const idle = getIdleApi();

  if (!idle?.queryState) {
    return "active";
  }

  try {
    return await idle.queryState(intervalSeconds);
  } catch {
    return "active";
  }
}

export function setIdleDetectionInterval(intervalSeconds: number): void {
  const idle = getIdleApi();

  if (!idle?.setDetectionInterval) {
    return;
  }

  try {
    idle.setDetectionInterval(intervalSeconds);
  } catch {
    // Safari and development runners may expose partial idle APIs. Treat missing support as active.
  }
}

export function addIdleStateChangedListener(callback: (newState: IdleState) => void): boolean {
  const idle = getIdleApi();

  if (!idle?.onStateChanged?.addListener) {
    return false;
  }

  idle.onStateChanged.addListener(callback);
  return true;
}
