import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveContextResolver } from "@/background/tracking/ActiveContextResolver";
import { createDefaultSettings } from "@/storage/defaults";

function tab(url: string): browser.tabs.Tab {
  return {
    id: 1,
    url,
    active: true,
    audible: false,
    incognito: false,
    windowId: 1,
    index: 0,
    highlighted: true,
    pinned: false,
    hidden: false,
    discarded: false,
    autoDiscardable: true
  };
}

describe("active context resolver", () => {
  beforeEach(() => {
    vi.stubGlobal("browser", {
      windows: {
        getAll: vi.fn(async () => [
          {
            id: 1,
            focused: true,
            tabs: [tab("https://princengare.github.io/0wl/privacy.html")]
          }
        ])
      }
    });
  });

  it("does not treat public 0wl app pages as trackable browsing", async () => {
    const resolver = new ActiveContextResolver();
    const context = await resolver.resolve(createDefaultSettings(1));

    expect(context.domain).toBe("princengare.github.io");
    expect(context.trackable).toBe(false);
  });
});
