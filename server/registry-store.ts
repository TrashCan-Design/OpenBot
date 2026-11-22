import { chmodSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { OwnedFile } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { BotsText } from "./bots-text.ts";
import { batchSaves, saveLater, saveSoon, supersedeLaterSave } from "./save-batch.ts";
import type { BotRecord, GroupRecord } from "./store.ts";

export const BOTS_FILE = join(DATA_DIR, "bots.json");
export const GROUPS_FILE = join(DATA_DIR, "groups.json");

export type RegistryOwner = { kind: "bot" | "group"; id: string };

export type RegistryDurability = "now" | "pass" | "later";

export interface RegistryStore {
  loadBots(): BotRecord[];
  loadGroups(): GroupRecord[];
  writeBots(bots: readonly BotRecord[], current: boolean): void;
  writeGroups(groups: readonly GroupRecord[]): void;
  upsertThread(owner: RegistryOwner & { kind: "bot" }, threadId: string | undefined, durability: RegistryDurability, write: () => void): void;
  upsertThread(owner: RegistryOwner & { kind: "group" }, threadId: string | undefined, durability: Exclude<RegistryDurability, "later">, write: () => void): void;
  changedInPlace(owner: RegistryOwner): void;
  deleteOwner(owner: RegistryOwner, write: () => void): void;
  batch<T>(run: () => T): T;
}

function tightenRegistryFile(file: string): void {
  // Windows has no POSIX mode bits.
  if (process.platform === "win32") return;
  try {
    if ((statSync(file).mode & 0o077) !== 0) chmodSync(file, 0o600);
  } catch {}
}

export function persistedPin<T extends { pinned?: boolean }>(task: T): T {
  if (task.pinned === true) return task;
  if (!("pinned" in task)) return task;
  const { pinned: _pinned, ...rest } = task;
  return rest as T;
}

export const persistedBot = ({ busy: _busy, activity: _activity, ...bot }: BotRecord) => ({ ...bot,
  tasks: bot.tasks?.map(({ busy: _taskBusy, activity: _taskActivity, turnStartedAt: _taskTurnStarted, ...task }) => persistedPin(task)),
});

export const persistedBots = (bots: readonly BotRecord[]) => bots.map(persistedBot);

export const BOTS_FULL_SAVE_ENV = "OPENBOT_BOTS_FULL_SAVE";
export const BOTS_SAVE_CHECK_ENV = "OPENBOT_BOTS_SAVE_CHECK";
const WHOLE_PASS = `${BOTS_FILE}:whole`;

export const persistedGroups = (groups: readonly GroupRecord[]) => groups.map(({ busyBotId: _busyBotId, turnStartedAt: _turnStartedAt, ...g }) => ({
  ...g,
  ...(g.tasks ? { tasks: g.tasks.map((task) => persistedPin(task)) } : {}),
}));

export class JsonRegistry implements RegistryStore {
  private readonly botsFile = new OwnedFile(BOTS_FILE, { mode: 0o600 });
  private readonly groupsFile = new OwnedFile(GROUPS_FILE, { mode: 0o600 });
  private readonly botsText = new BotsText(persistedBot);
  private readonly narrows = process.env[BOTS_FULL_SAVE_ENV] !== "1" && process.env.OMB_BOTS_FULL_SAVE !== "1";
  private readonly checksNarrowing = process.env.VITEST !== undefined || process.env[BOTS_SAVE_CHECK_ENV] === "1" || process.env.OMB_BOTS_SAVE_CHECK === "1";
  private narrowing = false;
  private narrowedSinceWhole = false;

  loadBots(): BotRecord[] {
    tightenRegistryFile(BOTS_FILE);
    supersedeLaterSave(BOTS_FILE);
    supersedeLaterSave(WHOLE_PASS);
    const text = readFileSync(BOTS_FILE, "utf8"), bots = JSON.parse(text) as BotRecord[];
    this.botsFile.loaded(text);
    return bots;
  }

  loadGroups(): GroupRecord[] {
    tightenRegistryFile(GROUPS_FILE);
    const text = readFileSync(GROUPS_FILE, "utf8"), groups = JSON.parse(text) as GroupRecord[];
    this.groupsFile.loaded(text);
    return groups;
  }

  writeBots(bots: readonly BotRecord[], current: boolean): void {
    const narrow = this.narrowing && current && this.botsText.canNarrow(bots);
    this.narrowing = false;
    const { text, commit } = this.botsText.build(bots, narrow);
    if (narrow && this.checksNarrowing) assertNarrowed(text, bots);
    try {
      this.botsFile.write(text);
    } catch (error) {
      this.botsText.forget();
      throw error;
    }
    if (current) {
      commit();
      supersedeLaterSave(BOTS_FILE);
      this.narrowedSinceWhole = narrow;
      if (!narrow) supersedeLaterSave(WHOLE_PASS);
    } else this.botsText.forget();
  }

  writeGroups(groups: readonly GroupRecord[]): void {
    this.groupsFile.write(JSON.stringify(persistedGroups(groups)));
  }

  upsertThread(owner: RegistryOwner, _threadId: string | undefined, durability: RegistryDurability, write: () => void): void {
    if (owner.kind === "bot" && this.narrows) {
      this.botsText.name(owner.id);
      if (durability !== "later") {
        const whole = write;
        write = () => this.narrowed(whole);
      }
    }
    if (durability === "pass") saveSoon(owner.kind === "bot" ? this.botsFile : this.groupsFile, write);
    else if (durability === "later") saveLater(BOTS_FILE, write);
    else write();
  }

  private narrowed(write: () => void): void {
    this.narrowing = true;
    try {
      write();
    } finally {
      this.narrowing = false;
    }
    if (this.narrowedSinceWhole) saveLater(WHOLE_PASS, write);
  }

  changedInPlace(owner: RegistryOwner): void {
    if (owner.kind === "bot") this.botsText.name(owner.id);
  }

  deleteOwner(_owner: RegistryOwner, write: () => void): void {
    write();
  }

  batch<T>(run: () => T): T {
    return batchSaves(run);
  }
}

function assertNarrowed(text: string, bots: readonly BotRecord[]): void {
  if (text === JSON.stringify(persistedBots(bots))) return;
  const stale = bots.filter((bot) => !text.includes(JSON.stringify(persistedBot(bot)))).map((bot) => bot.id);
  throw new Error(`a narrowed save of bots.json left out a change to ${stale.join(", ")}: name its owner, or save it whole`);
}
