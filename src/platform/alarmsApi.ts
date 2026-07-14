import { browser } from "@/shared/browser";

interface AlarmInfo {
  when?: number;
  delayInMinutes?: number;
  periodInMinutes?: number;
}

interface Alarm {
  name: string;
  scheduledTime?: number;
  periodInMinutes?: number;
}

interface AlarmsApiShape {
  clear?: (name?: string) => Promise<boolean>;
  create?: (name: string, alarmInfo: AlarmInfo) => void;
  onAlarm?: {
    addListener?: (callback: (alarm: Alarm) => void) => void;
  };
}

function getAlarmsApi(): AlarmsApiShape | undefined {
  return (browser as unknown as { alarms?: AlarmsApiShape }).alarms;
}

export function isAlarmsApiSupported(): boolean {
  const alarms = getAlarmsApi();
  return Boolean(alarms?.clear && alarms.create && alarms.onAlarm?.addListener);
}

export async function clearAlarm(name: string): Promise<boolean> {
  const alarms = getAlarmsApi();

  if (!alarms?.clear) {
    return false;
  }

  try {
    return await alarms.clear(name);
  } catch {
    return false;
  }
}

export function createAlarm(name: string, alarmInfo: AlarmInfo): boolean {
  const alarms = getAlarmsApi();

  if (!alarms?.create) {
    return false;
  }

  try {
    alarms.create(name, alarmInfo);
    return true;
  } catch {
    return false;
  }
}

export function addAlarmListener(callback: (alarm: Alarm) => void): boolean {
  const alarms = getAlarmsApi();

  if (!alarms?.onAlarm?.addListener) {
    return false;
  }

  alarms.onAlarm.addListener(callback);
  return true;
}
