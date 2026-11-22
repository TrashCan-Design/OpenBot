import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnedFile } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { BOTS_FILE, BOTS_FULL_SAVE_ENV, JsonRegistry, persistedBots } from "./registry-store.ts";
import { flushLaterSaves } from "./save-batch.ts";
import type { BotRecord } from "./store.ts";

const bot = (id: string, threads = 2) => ({ id, name: id, threadId: `${id}-0`, soul: `${id} soul`, busy: true, activity: "working",
  tasks: Array.from({ length: threads }, (_, t) => ({ threadId: `${id}-${t}`, title: `Thread ${t}`, busy: false, turnStartedAt: 1, pinned: t === 0 })) }) as unknown as BotRecord;
const owner = (id: string) => ({ kind: "bot", id }) as const;
const onDisk = () => readFileSync(BOTS_FILE, "utf8");

function serialized(bots: readonly BotRecord[], run: () => void): string[] {
  const ids = new Set(bots.map((b) => b.id));
  const stringify = vi.spyOn(JSON, "stringify");
  try {
    run();
    return stringify.mock.calls.flatMap(([value]) => {
      const record = value as { id?: unknown; soul?: unknown } | null;
      return record && !Array.isArray(record) && typeof record.id === "string" && ids.has(record.id) && "soul" in record ? [record.id] : [];
    });
  } finally {
    stringify.mockRestore();
  }
}

describe("bots.json saves that name their bot serialize only that bot", () => {
  beforeEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
    mkdirSync(DATA_DIR, { recursive: true });
  });
  afterEach(() => {
    flushLaterSaves();
    delete process.env[BOTS_FULL_SAVE_ENV];
  });

  it("serializes the named bot and writes the same bytes a whole serialization would", () => {
    const registry = new JsonRegistry();
    const bots = [bot("a"), bot("b"), bot("c")];
    const save = () => registry.writeBots(bots, true);
    expect(serialized(bots, save).sort(), "the first save knows nothing yet").toEqual(["a", "b", "c"]);
    bots[1]!.tasks![0]!.title = "Renamed in place";
    expect(serialized(bots, () => registry.upsertThread(owner("b"), "b-0", "now", save))).toEqual(["b"]);
    expect(onDisk()).toBe(JSON.stringify(persistedBots(bots)));
  });

  it("writes a change made in place to a bot no save named with the whole pass that follows a narrowed save", () => {
    const registry = new JsonRegistry();
    const bots = [bot("a"), bot("b")];
    const save = () => registry.writeBots(bots, true);
    save();
    bots[1]!.name = "Changed elsewhere";
    expect(() => registry.upsertThread(owner("a"), undefined, "now", save)).toThrow(/left out a change to b/);
    expect(JSON.parse(onDisk())[1].name).toBe("b");

    const vitest = process.env.VITEST;
    delete process.env.VITEST;
    const quiet = new JsonRegistry();
    process.env.VITEST = vitest;
    const write = () => quiet.writeBots(bots, true);
    write();
    bots[1]!.name = "Changed again";
    quiet.upsertThread(owner("a"), undefined, "now", write);
    expect(JSON.parse(onDisk())[1].name, "not in the narrowed save").toBe("Changed elsewhere");
    flushLaterSaves();
    expect(onDisk()).toBe(JSON.stringify(persistedBots(bots)));
  });

  it("writes a permission changed in place on a bot no save named in the very next save, whichever bot that names", () => {
    const vitest = process.env.VITEST;
    delete process.env.VITEST;
    const registry = new JsonRegistry();
    process.env.VITEST = vitest;
    const bots = [bot("a"), bot("b"), bot("c")];
    Object.assign(bots[1]!, { approvalMode: "full", alwaysAllow: ["Bash(git push)"] });
    Object.assign(bots[2]!.tasks![1]!, { alwaysAllow: ["Bash(rm -rf build)"] });
    const save = () => registry.writeBots(bots, true);
    save();
    for (const revoke of [
      () => { bots[1]!.approvalMode = "ask"; },
      () => { bots[1]!.alwaysAllow = []; },
      () => { delete bots[2]!.tasks![1]!.alwaysAllow; },
      () => { bots[2]!.toolScope = { allow: [], deny: ["native:bash"] } as never; },
    ]) {
      revoke();
      bots[0]!.name = `${bots[0]!.name}.`;
      registry.upsertThread(owner("a"), undefined, "now", save);
      expect(onDisk(), "on disk when the save returns, with no whole pass yet").toBe(JSON.stringify(persistedBots(bots)));
    }
  });

  it("serializes every bot again when the list gained, lost or moved a bot, or a bot was replaced", () => {
    const registry = new JsonRegistry();
    const bots = [bot("a"), bot("b"), bot("c")];
    const save = () => registry.writeBots(bots, true);
    save();
    for (const change of [
      () => bots.unshift(bot("d")),
      () => bots.splice(1, 1),
      () => bots.reverse(),
      () => { bots[0] = { ...bots[0]!, name: "Replaced" }; },
    ]) {
      change();
      expect(serialized(bots, () => registry.upsertThread(owner(bots[0]!.id), undefined, "pass", save))).toHaveLength(bots.length);
      expect(onDisk()).toBe(JSON.stringify(persistedBots(bots)));
    }
  });

  it("serializes every bot after a save of a list that is not live yet, and after a write that failed", () => {
    const registry = new JsonRegistry();
    const bots = [bot("a"), bot("b")];
    const save = () => registry.writeBots(bots, true);
    save();
    registry.writeBots([...bots, bot("pending")], false);
    expect(serialized(bots, () => registry.upsertThread(owner("a"), undefined, "now", save))).toHaveLength(2);

    bots[0]!.name = "Will fail";
    const write = vi.spyOn(OwnedFile.prototype, "write").mockImplementationOnce(() => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); });
    expect(() => registry.upsertThread(owner("a"), undefined, "now", save)).toThrow(/disk full/);
    write.mockRestore();
    bots[1]!.name = "Changed meanwhile";
    expect(serialized(bots, () => registry.upsertThread(owner("a"), undefined, "now", save)), "the retry is whole").toHaveLength(2);
    expect(onDisk()).toBe(JSON.stringify(persistedBots(bots)));
  });

  it("serializes every bot on every save with the switch set", () => {
    process.env[BOTS_FULL_SAVE_ENV] = "1";
    const registry = new JsonRegistry();
    const bots = [bot("a"), bot("b"), bot("c")];
    const save = () => registry.writeBots(bots, true);
    save();
    bots[1]!.name = "Changed";
    expect(serialized(bots, () => registry.upsertThread(owner("b"), undefined, "now", save))).toHaveLength(3);
    expect(onDisk()).toBe(JSON.stringify(persistedBots(bots)));
  });
});
