import { describe, expect, it } from "vitest";
import { APP_PRIVACY_POLICY_URL, isAppSurfaceUrl } from "@/shared/appSurface";

describe("app surface URL handling", () => {
  it("recognizes the public 0wl privacy policy as an app surface", () => {
    expect(isAppSurfaceUrl(APP_PRIVACY_POLICY_URL)).toBe(true);
  });

  it("recognizes public 0wl documentation pages as app surfaces", () => {
    expect(isAppSurfaceUrl("https://princengare.github.io/0wl/development.html")).toBe(true);
  });

  it("does not treat unrelated GitHub Pages URLs as app surfaces", () => {
    expect(isAppSurfaceUrl("https://princengare.github.io/other-project/privacy.html")).toBe(false);
  });
});
