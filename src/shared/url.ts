const TRACKABLE_PROTOCOLS = new Set(["http:", "https:"]);

export function isTrackableUrl(input: string | null | undefined): boolean {
  if (!input) {
    return false;
  }

  try {
    const url = new URL(input);
    return TRACKABLE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function hostnameFromTrackableUrl(input: string): string | null {
  if (!isTrackableUrl(input)) {
    return null;
  }

  try {
    const url = new URL(input);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}
