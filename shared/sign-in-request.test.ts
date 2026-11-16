import { describe, expect, it } from "vitest";

import { isPendingSignInRequest, normalizeSignInSite, signInOutcome, signInResumePrompt, signInWaits } from "./sign-in-request.ts";

describe("signInWaits", () => {
  it("waits while not done, cancelled, superseded, answered in chat, or stopped", () => {
    expect(signInWaits({})).toBe(true);
    expect(signInWaits({ done: false, cancelled: false, superseded: false, answeredInChat: false, stopped: false })).toBe(true);
  });

  it("does not wait when done, cancelled, superseded, answered in chat, or stopped", () => {
    expect(signInWaits({ done: true })).toBe(false);
    expect(signInWaits({ cancelled: true })).toBe(false);
    expect(signInWaits({ superseded: true })).toBe(false);
    expect(signInWaits({ answeredInChat: true })).toBe(false);
    expect(signInWaits({ stopped: true })).toBe(false);
  });
});

describe("isPendingSignInRequest", () => {
  const req = (extra: Record<string, unknown> = {}) => ({
    kind: "signin",
    signIn: { site: "github.com", ...extra },
    from: { botId: "bot-1" },
  });

  it("considers an open card pending", () => {
    expect(isPendingSignInRequest(req(), "github.com", "bot-1", false)).toBe(true);
  });

  it("never considers a stopped card pending", () => {
    expect(isPendingSignInRequest(req({ stopped: true }), "github.com", "bot-1", false)).toBe(false);
  });

  it("never considers settled cards pending", () => {
    expect(isPendingSignInRequest(req({ done: true }), "github.com", "bot-1", false)).toBe(false);
    expect(isPendingSignInRequest(req({ cancelled: true }), "github.com", "bot-1", false)).toBe(false);
    expect(isPendingSignInRequest(req({ superseded: true }), "github.com", "bot-1", false)).toBe(false);
  });
});

describe("normalizeSignInSite", () => {
  it("normalizes domains and URLs", () => {
    expect(normalizeSignInSite("github.com")).toEqual({ url: "https://github.com/", site: "github.com" });
    expect(normalizeSignInSite("https://www.google.com/search")).toEqual({ url: "https://www.google.com/search", site: "google.com" });
  });

  it("rejects invalid or bare inputs", () => {
    expect(normalizeSignInSite("")).toBeNull();
    expect(normalizeSignInSite("example")).toBeNull();
    expect(normalizeSignInSite("javascript:alert(1)")).toBeNull();
  });
});

describe("signInOutcome & resumePrompt", () => {
  it("reports outcome and builds resume prompt", () => {
    expect(signInOutcome({ done: true })).toBe("done");
    expect(signInOutcome({ cancelled: true })).toBe("cancelled");
    expect(signInOutcome({})).toBeNull();
    expect(signInResumePrompt("github.com", "done")).toContain("finished signing in");
    expect(signInResumePrompt("github.com", "cancelled")).toContain("declined to sign in");
  });
});
