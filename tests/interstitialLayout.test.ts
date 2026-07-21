import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/terminal.css"), "utf8");

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[\\s\\S]*?)\\}`));
  return match?.groups?.body ?? "";
}

describe("interstitial layout", () => {
  it("keeps blocked and limit interstitials within one viewport including the footer", () => {
    const centered = ruleFor(".terminal-centered");
    const frame = ruleFor(".terminal-centered .terminal-frame");
    const body = ruleFor(".terminal-blocked-body");
    const footer = ruleFor(".terminal-centered .terminal-brand-footer");

    expect(centered).toContain("height: 100vh");
    expect(centered).toContain("overflow: hidden");
    expect(centered).toContain("grid-template-rows: minmax(0, auto) auto");
    expect(frame).toContain("max-height: calc(100vh - 4rem)");
    expect(frame).toContain("overflow: hidden");
    expect(body).toContain("max-height: calc(100vh - 5rem)");
    expect(footer).toContain("margin-top: 0");
  });
});
