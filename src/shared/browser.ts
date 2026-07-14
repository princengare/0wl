import { browser as wxtBrowser } from "wxt/browser";

type BrowserApi = typeof wxtBrowser;

interface ExtensionGlobal {
  browser?: BrowserApi;
  chrome?: BrowserApi;
}

function resolveBrowser(): BrowserApi {
  const extensionGlobal = globalThis as typeof globalThis & ExtensionGlobal;
  const api = extensionGlobal.browser ?? extensionGlobal.chrome ?? wxtBrowser;

  if (!api) {
    throw new Error("Extension browser API is unavailable.");
  }

  return api;
}

export const browser = new Proxy<Record<PropertyKey, unknown>>(
  {},
  {
    get(_target, property) {
      return resolveBrowser()[property as keyof BrowserApi];
    }
  }
) as BrowserApi;
