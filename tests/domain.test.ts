import { describe, expect, it } from "vitest";
import { normalizeDomain } from "@/shared/domain";

describe("domain normalization", () => {
  it("normalizes common mobile and www subdomains to the registrable domain", () => {
    expect(normalizeDomain("www.instagram.com")).toBe("instagram.com");
    expect(normalizeDomain("m.instagram.com")).toBe("instagram.com");
  });

  it("uses Public Suffix List aware registrable domains", () => {
    expect(normalizeDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
  });

  it("normalizes URL input without storing paths", () => {
    expect(normalizeDomain("https://instagram.com/reels/?x=1")).toBe("instagram.com");
  });

  it("rejects invalid input", () => {
    expect(() => normalizeDomain("not a domain")).toThrow();
    expect(() => normalizeDomain("about:preferences")).toThrow();
    expect(() => normalizeDomain("http://localhost:3000")).toThrow();
  });
});
