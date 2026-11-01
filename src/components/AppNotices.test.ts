import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ seen: false, blocked: false, firstRun: false, welcome: false }));
vi.mock("@/state/store", () => ({ useStore: () => ({ state: {} }) }));
vi.mock("@/lib/corner-popup", () => ({ cornerPopupWaits: () => fixture.blocked, firstReplyPending: () => fixture.firstRun }));
vi.mock("@/lib/onboarding", () => ({ welcomeFinishedThisLaunch: () => false }));
vi.mock("@/lib/launch-dialogs", () => ({ launchDialogShown: () => null, markLaunchDialog: vi.fn() }));
vi.mock("@/lib/notices", () => ({ SIMPLE_MODE_NOTICE: "simple-mode", markLaunchNotice: vi.fn() }));
vi.mock("@/lib/simple-mode-prompt", () => ({ useSimpleModePromptSeen: () => fixture.seen }));
vi.mock("@/lib/updater", () => ({ useUpdaterState: () => null }));
vi.mock("./OpenBotWelcome", () => ({ useOpenBotWelcomeDue: () => ({ due: fixture.welcome }) }));
vi.mock("./notice-dialogs", () => ({ useOtherDialogOpen: () => false }));
vi.mock("./SimpleModePrompt", () => ({
  reportSimpleModePrompt: vi.fn(),
  SimpleModePrompt: () => createElement("div", { "data-simple-mode-prompt": true }, "Interface mode"),
}));

import { AppNotices } from "./AppNotices";

beforeEach(() => {
  fixture.seen = false;
  fixture.blocked = false;
  fixture.firstRun = false;
  fixture.welcome = false;
});

it("shows the local interface prompt without hosted Cloud or Boat promotions", () => {
  const html = renderToStaticMarkup(createElement(AppNotices));
  expect(html).toContain("Interface mode");
  expect(html).not.toMatch(/Cloud|Boat|trial|checkout/i);
});

it("waits for the first conversation and for an unobstructed window", () => {
  fixture.firstRun = true;
  expect(renderToStaticMarkup(createElement(AppNotices))).toBe("");
  fixture.firstRun = false;
  fixture.blocked = true;
  expect(renderToStaticMarkup(createElement(AppNotices))).toBe("");
  fixture.blocked = false;
  fixture.seen = true;
  expect(renderToStaticMarkup(createElement(AppNotices))).toBe("");
});
