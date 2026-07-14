import { DATABASE_NAME, DATABASE_VERSION } from "@/shared/constants";

export const DB_NAME = DATABASE_NAME;
export const DB_VERSION = DATABASE_VERSION;

export const STORE_SESSIONS = "sessions";
export const STORE_DAILY_USAGE = "daily_usage";
export const STORE_BLOCK_ATTEMPTS = "block_attempts";
export const STORE_DOMAIN_TRANSITIONS = "domain_transitions";
export const STORE_BROWSING_INTENTS = "browsing_intents";

export const INDEX_DOMAIN = "domain";
export const INDEX_FROM_DOMAIN = "fromDomain";
export const INDEX_TO_DOMAIN = "toDomain";
export const INDEX_STARTED_AT = "startedAt";
export const INDEX_ENDED_AT = "endedAt";
export const INDEX_TRANSITIONED_AT = "transitionedAt";
export const INDEX_DATE_KEY = "dateKey";
export const INDEX_DATE_DOMAIN = "dateKey_domain";
export const INDEX_OUTCOME = "outcome";
