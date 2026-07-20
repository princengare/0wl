export const APP_SITE_ORIGIN = "https://princengare.github.io";
export const APP_SITE_PATH_PREFIX = "/0wl";
export const APP_PRIVACY_POLICY_URL = `${APP_SITE_ORIGIN}${APP_SITE_PATH_PREFIX}/privacy.html`;

export function isAppSurfaceUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      parsed.origin === APP_SITE_ORIGIN &&
      (parsed.pathname === APP_SITE_PATH_PREFIX ||
        parsed.pathname.startsWith(`${APP_SITE_PATH_PREFIX}/`))
    );
  } catch {
    return false;
  }
}
