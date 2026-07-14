export const DATABASE_NAME = "focus_tracker";
export const DATABASE_VERSION = 2;

export const SETTINGS_STORAGE_KEY = "settings";
export const RUNTIME_STATE_STORAGE_KEY = "runtimeTrackingState";
export const RUNTIME_SESSION_META_STORAGE_KEY = "runtimeTrackingSessionMeta";
export const LIFECYCLE_STORAGE_KEY = "extensionLifecycle";
export const VISION_SETTINGS_STORAGE_KEY = "visionSettings";
export const VISION_CLASSIFICATIONS_STORAGE_KEY = "visionDomainClassifications";

export const MANAGED_RULE_ID_MIN = 1_000_000;
export const MANAGED_RULE_ID_SPAN = 400_000_000;
export const TIME_LIMIT_RULE_ID_MIN = 500_000_000;
export const TIME_LIMIT_RULE_ID_SPAN = 400_000_000;
export const FRICTION_RULE_ID_MIN = 900_000_000;
export const FRICTION_RULE_ID_SPAN = 90_000_000;

export const BLOCKED_PAGE_PATH = "blocked.html";
export const TIME_LIMIT_PAGE_PATH = "limit.html";
export const FRICTION_PAGE_PATH = "friction.html";
export const TIME_LIMIT_ALARM_NAME = "active-time-limit-check";
export const BLOCK_RULE_ALARM_NAME = "scheduled-block-rule-check";
export const FRICTION_RULE_ALARM_NAME = "scheduled-friction-rule-check";
export const TIME_LIMIT_BYPASS_DURATION_MS = 15 * 60 * 1000;
export const INTENT_CHECKIN_DURATION_MS = 15 * 60 * 1000;

export const DEFAULT_IDLE_THRESHOLD_SECONDS = 60;
export const MIN_VALID_SESSION_DURATION_MS = 1;
