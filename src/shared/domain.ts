import { parse } from "tldts";

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const UNSAFE_INPUT_PATTERN = /[\s<>"'`\\]/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function toHostname(input: string): string {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) {
    throw new DomainValidationError("Enter a website domain.");
  }

  if (UNSAFE_INPUT_PATTERN.test(trimmed) || containsControlCharacter(trimmed)) {
    throw new DomainValidationError("Domain contains unsupported characters.");
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new DomainValidationError("Only HTTP and HTTPS website URLs can be blocked.");
  }

  try {
    const url = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new DomainValidationError("Enter a valid website domain.");
  }
}

function assertSafeDomain(domain: string): void {
  const labels = domain.split(".");

  if (labels.length < 2 || domain.length > 253) {
    throw new DomainValidationError("Enter a registrable website domain.");
  }

  if (!labels.every((label) => DOMAIN_LABEL_PATTERN.test(label))) {
    throw new DomainValidationError("Domain contains unsupported characters.");
  }
}

export function normalizeDomain(input: string): string {
  const hostname = toHostname(input);
  const parsed = parse(hostname, { allowPrivateDomains: true });

  if (parsed.isIp) {
    throw new DomainValidationError("IP addresses are not supported in V1.");
  }

  if (!parsed.domain) {
    throw new DomainValidationError("Enter a registrable website domain.");
  }

  const domain = parsed.domain.toLowerCase();
  assertSafeDomain(domain);
  return domain;
}

export function tryNormalizeDomain(input: string): string | null {
  try {
    return normalizeDomain(input);
  } catch {
    return null;
  }
}

export function normalizeDomainFromUrl(url: string): string | null {
  try {
    return normalizeDomain(url);
  } catch {
    return null;
  }
}

export function isSameOrSubdomain(candidate: string, blockedDomain: string): boolean {
  const normalizedCandidate = tryNormalizeDomain(candidate);
  const normalizedBlocked = tryNormalizeDomain(blockedDomain);

  if (!normalizedCandidate || !normalizedBlocked) {
    return false;
  }

  return (
    normalizedCandidate === normalizedBlocked ||
    normalizedCandidate.endsWith(`.${normalizedBlocked}`)
  );
}
