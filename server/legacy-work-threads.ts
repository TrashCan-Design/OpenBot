import { existsSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "./atomic.ts";
import type { BotRecord, TaskRecord } from "./store.ts";

/** The day Full access became the level a new bot and thread start at. */
export const FULL_ACCESS_DEFAULT_SINCE = Date.UTC(2026, 9, 14);

const MARKER = "legacy-work-threads-follow-bot";

/** A hand-off's standing work thread (not a room job's), made before that day, that still saves Ask. */
export function legacyAskWorkThread(task: TaskRecord): boolean {
  const opened = task.openedBy;
  if (opened?.kind !== "work" || opened.roomLane || task.approvalMode !== "ask") return false;
  const at = Number.isFinite(task.createdAt) ? task.createdAt : opened.at;
  return Number.isFinite(at) && at < FULL_ACCESS_DEFAULT_SINCE;
}

/** Runs once per data directory on load to drop legacy Ask from work threads opened before Full access was default. */
export function repairLegacyWorkThreads(dataDir: string, bots: readonly BotRecord[], readable: boolean): { changed: boolean; done(): void } | null {
  const marker = join(dataDir, MARKER);
  if (!readable || existsSync(marker)) return null;
  let changed = false;
  for (const task of bots.flatMap((bot) => bot.approvalGrant ? [] : bot.tasks ?? [])) {
    if (!legacyAskWorkThread(task)) continue;
    delete task.approvalMode;
    delete task.autoApprove;
    delete task.alwaysAllow;
    changed = true;
  }
  return { changed, done: () => writeFileAtomic(marker, "Work threads saved at Ask before Full access was the default follow their bot.\n", { mode: 0o600 }) };
}
