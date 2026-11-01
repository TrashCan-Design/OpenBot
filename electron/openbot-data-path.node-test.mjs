import assert from "node:assert/strict";
import { test } from "node:test";
import { openBotDataDir, openBotUserDataPath, withoutHostedPlaces } from "./openbot-data-path.mjs";

test("existing desktop data survives the display-name change", () => {
  const exists = (path) => path === "/data/OpenMausBot";
  assert.equal(openBotUserDataPath("/data/OpenBot", exists), "/data/OpenMausBot");
  assert.equal(openBotUserDataPath("/data/OpenBot", () => false), "/data/OpenBot");
  assert.equal(openBotUserDataPath("/data/OpenBot", () => true), "/data/OpenBot");
});

test("existing chats and an explicit data directory take priority", () => {
  const exists = (path) => path === "/home/me/.openmausbot";
  assert.equal(openBotDataDir("/home/me", undefined, exists), "/home/me/.openmausbot");
  assert.equal(openBotDataDir("/home/me", "/custom/data", exists), "/custom/data");
  assert.equal(openBotDataDir("/home/me", undefined, () => false), "/home/me/.openbot");
});

test("hosted places cannot reconnect, while paired self-hosted servers remain", () => {
  const state = { activeId: "hosted", environments: [
    { id: "hosted", home: true, origin: "https://old.example" },
    { id: "team", team: { id: "t" }, origin: "https://team.example" },
    { id: "paired", origin: "https://own.example", kind: "remote" },
  ] };
  assert.deepEqual(withoutHostedPlaces(state), {
    ...state, activeId: "local", environments: [state.environments[2]],
  });
});
