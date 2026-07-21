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

  it("falls back when windowTypes is not supported by the browser API", async () => {
    const getAll = vi
      .fn()
      .mockRejectedValueOnce(new Error("windowTypes is unsupported"))
      .mockResolvedValueOnce([
        {
          id: 1,
          focused: true,
          type: "normal",
          tabs: [tab("https://github.com/openai")]
        }
      ]);
    vi.stubGlobal("browser", {
      windows: {
        getAll
      }
    });

    const resolver = new ActiveContextResolver();
    const context = await resolver.resolve(createDefaultSettings(1));

    expect(context.browserFocused).toBe(true);
    expect(context.domain).toBe("github.com");
    expect(context.trackable).toBe(true);
    expect(getAll).toHaveBeenNthCalledWith(2, { populate: true });
  });
});
