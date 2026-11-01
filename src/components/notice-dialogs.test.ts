// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { otherDialogOpen } from "./notice-dialogs";

afterEach(() => document.body.replaceChildren());

it("waits while another visible dialog is open", () => {
  const dialog = document.body.appendChild(document.createElement("div"));
  dialog.setAttribute("role", "dialog");
  expect(otherDialogOpen()).toBe(true);
  dialog.style.display = "none";
  expect(otherDialogOpen()).toBe(false);
});

it("ignores its own simple mode and updater consent prompts", () => {
  for (const own of ["data-simple-mode-prompt", "data-updates-consent-popup"]) {
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute(own, "");
    expect(otherDialogOpen()).toBe(false);
    dialog.remove();
  }
});
