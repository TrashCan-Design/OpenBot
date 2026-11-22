import { RESTART_EXIT_CODE } from "./restart.ts";

let depth = 0;
const pending = new Map<object, () => void>();

export function batchSaves<T>(run: () => T): T {
  depth += 1;
  try {
    return run();
  } finally {
    depth -= 1;
    if (depth === 0) writePending();
  }
}

export function saveSoon(owner: object, write: () => void): void {
  if (depth === 0) write();
  else pending.set(owner, write);
}

function writePending(): void {
  while (pending.size) {
    const [owner, write] = pending.entries().next().value!;
    pending.delete(owner);
    try {
      write();
    } catch (error) {
      console.error("a batched save failed; the next save of the file retries it", error);
    }
  }
}

const SAVE_LATER_MIN_MS = 50;
export const SAVE_LATER_MAX_MS = 1_000;
const SAVE_LATER_COST_FACTOR = 10;
const SAVE_LATER_RETRIES = 5;

const later = new Map<unknown, () => void>();
let laterTimer: ReturnType<typeof setTimeout> | undefined;
let lastLaterWriteMs = 0;
let laterFailures = 0;
let flushesAtExit = false;

export const saveLaterDelayMs = (): number => Math.min(SAVE_LATER_MAX_MS, Math.max(SAVE_LATER_MIN_MS, lastLaterWriteMs * SAVE_LATER_COST_FACTOR));

export function saveLater(owner: unknown, write: () => void): void {
  later.set(owner, write);
  if (!flushesAtExit) {
    flushesAtExit = true;
    process.on("exit", flushAtCleanExit);
  }
  laterTimer ??= setTimeout(flushLaterSaves, saveLaterDelayMs());
}

export function supersedeLaterSave(owner: unknown): void {
  later.delete(owner);
}

export const waitingSaves = (): number => later.size;

export function flushAtCleanExit(code: number): void {
  if (code === 0 || code === RESTART_EXIT_CODE) flushLaterSaves();
}

export function flushLaterSaves(): void {
  if (laterTimer) clearTimeout(laterTimer);
  laterTimer = undefined;
  if (!later.size) return;
  const started = performance.now();
  let failed = false;
  for (const [owner, write] of Array.from(later)) {
    later.delete(owner);
    try {
      write();
    } catch (error) {
      failed = true;
      if (!later.has(owner)) later.set(owner, write);
      console.error("a deferred save failed; it is tried again", error);
    }
  }
  lastLaterWriteMs = performance.now() - started;
  laterFailures = failed ? laterFailures + 1 : 0;
  if (later.size && laterFailures <= SAVE_LATER_RETRIES) laterTimer = setTimeout(flushLaterSaves, SAVE_LATER_MAX_MS);
}
