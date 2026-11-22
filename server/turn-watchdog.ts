import { processAlive } from "./browser-processes.ts";
import type { ProviderAdapter, RuntimeEvent } from "./contracts.ts";
import type { ServerTextParams } from "./chat-notices.ts";
import { sampleProcessTree, type ProcessSample } from "./drivers/acp/quiet-status.ts";
import { redactSecretsInText } from "../shared/redact.ts";

// A turn whose thread emits nothing for stallMs is wedged; waiting on a person or a computer is not a stall unless the
// turn's engine is known to have no process left. Drivers report a tool only when it starts and when it ends, so a turn
// with a tool running may stay silent for toolStallMs, and one whose shell command's processes keep using CPU is working,
// not silent, however long the command runs.
export interface WatchedTurn {
  threadId: string;
  botId: string;
  startedAt: number;
  lastEventAt: number;
  waitingOnHuman: boolean;
  waitingOnComputer: boolean;
  runningTools: Map<string, RunningTool>;
}

export interface RunningTool {
  startedAt: number;
  command?: string;
}

function oldestCommand(turn: Partial<Pick<WatchedTurn, "runningTools">>): (RunningTool & { command: string }) | undefined {
  let oldest: (RunningTool & { command: string }) | undefined;
  for (const tool of turn.runningTools?.values() ?? []) {
    if (typeof tool === "object" && tool.command && (!oldest || tool.startedAt < oldest.startedAt)) {
      oldest = tool as RunningTool & { command: string };
    }
  }
  return oldest;
}

/** The longest-running shell command of a turn stopped at stopAt, with the whole minutes it ran: what the person is told
 * looks stuck, with any secret in it scrubbed. null when no running tool runs a shell command. */
export function stuckCommand(turn: Partial<Pick<WatchedTurn, "runningTools">>, stopAt: number): { command: string; minutes: number } | null {
  const oldest = oldestCommand(turn);
  return oldest ? { command: redactSecretsInText(oldest.command), minutes: Math.max(1, Math.round((stopAt - oldest.startedAt) / 60_000)) } : null;
}

/** Why the watchdog stopped a turn: it went silent, or the process running its engine exited and the turn can never
 * answer. */
export type StallReason = "silent" | "engine-exited" | "server-error";

/** The silence that stops a turn whose engine process has exited: its engine can never answer it, so it waits only long
 * enough for the driver to report the turn's own end, and not for the tool limit. */
export const ENGINE_EXIT_STALL_MS = 2 * 60_000;

/** What the person is told when the watchdog stops a turn silent for silentMs: the shell command still running, with how
 * long it ran, so they know what looked stuck; otherwise how long the turn was silent. A turn whose engine process
 * exited is told that instead: no silence of its own stopped it. */
export function stallNotice(turn: Partial<Pick<WatchedTurn, "runningTools">>, silentMs: number, stopAt: number, reason: StallReason = "silent"):
  { key: "chat.notice.engineExited"; params: ServerTextParams } | { key: "chat.notice.stalledCommand"; params: { command: string; minutes: number } } | { key: "chat.notice.stalled"; params: { minutes: number } } {
  if (reason === "engine-exited") return { key: "chat.notice.engineExited", params: {} };
  const stuck = stuckCommand(turn, stopAt);
  return stuck ? { key: "chat.notice.stalledCommand", params: stuck } : { key: "chat.notice.stalled", params: { minutes: Math.round(silentMs / 60_000) } };
}

// Number() also reads "Infinity" and "1e309" as numbers, and an endless limit would switch the watchdog off.
export function stallLimitMs(raw: string | undefined, fallback: number): number {
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : fallback;
}

/** The turn's engine has no process left: the driver names one and that process is gone, or names none at all. */
export function engineProcessGone(adapter: Pick<ProviderAdapter, "enginePid"> | null | undefined, threadId: string, alive = processAlive): boolean {
  if (!adapter?.enginePid) return false;
  const pid = adapter.enginePid(threadId);
  return pid === undefined || !alive(pid);
}

/** The engine's process for the thread's turn has exited: the driver names one and that process is gone. A driver that
 * names no process for the turn proves nothing (the turn may not have started one yet), so this is false for it. */
export function engineProcessExited(adapter: Pick<ProviderAdapter, "enginePid"> | null | undefined, threadId: string, alive = processAlive): boolean {
  if (!adapter?.enginePid) return false;
  const pid = adapter.enginePid(threadId);
  return pid !== undefined && !alive(pid);
}

/** The CPU time used by the processes the thread's engine started since `since` (what a tool call started then runs, not
 * the engine or its tool servers); null when the driver tracks no engine process or the time cannot be read. */
export async function engineCommandCpuMs(adapter: Pick<ProviderAdapter, "enginePid"> | null | undefined, threadId: string, since: number,
  sample: (pid: number, since: number) => Promise<ProcessSample> = sampleProcessTree): Promise<number | null> {
  const pid = adapter?.enginePid?.(threadId);
  return pid === undefined ? null : (await sample(pid, since)).cpuMs;
}

const parked = (turn: WatchedTurn): boolean => turn.waitingOnHuman || turn.waitingOnComputer;
const SUSPENDED_SWEEPS = 3;

export interface TurnWatchdogOptions {
  stallMs: number;
  toolStallMs: number;
  parkedStallMs?: number;
  engineExitStallMs?: number;
  checkMs: number;
  engineGone?: (turn: WatchedTurn) => boolean;
  engineExited?: (turn: WatchedTurn) => boolean;
  commandCpuMs?: (turn: WatchedTurn, since: number) => Promise<number | null>;
  onStall: (turn: WatchedTurn, silentMs: number, reason: StallReason) => void;
  unheld?: { threads(): Iterable<{ threadId: string; botId: string }>; free(threadId: string, botId: string): void };
  now?: () => number;
}

export class TurnWatchdog {
  private turns = new Map<string, WatchedTurn>();
  private unheldSince = new Map<string, number>();
  private cpu = new WeakMap<WatchedTurn, { since: number; ms: number | null; reading: boolean }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: TurnWatchdogOptions;

  // No parameter properties: Node's type-stripping cannot transform them.
  constructor(opts: TurnWatchdogOptions) {
    this.opts = opts;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  start(): void {
    if (this.timer) return;
    let lastTickAt = Date.now();
    this.timer = setInterval(() => {
      const at = Date.now();
      const gap = at - lastTickAt;
      lastTickAt = at;
      this.sweep(gap > SUSPENDED_SWEEPS * this.opts.checkMs ? gap : 0);
    }, this.opts.checkMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.turns.clear();
    this.unheldSince.clear();
  }

  watch(threadId: string, botId: string): void {
    const at = this.now();
    this.turns.set(threadId, { threadId, botId, startedAt: at, lastEventAt: at, waitingOnHuman: false, waitingOnComputer: false,
      runningTools: new Map() });
  }

  observe(event: RuntimeEvent): void {
    const turn = this.turns.get(event.threadId);
    if (!turn) return;
    turn.lastEventAt = this.now();
    if ((event.type !== "item.started" && event.type !== "item.completed") || event.itemType !== "tool" || !event.itemId) return;
    if (event.type === "item.completed") turn.runningTools.delete(event.itemId);
    else turn.runningTools.set(event.itemId, { startedAt: turn.lastEventAt, ...(event.summary ? { command: event.summary } : {}) });
  }

  setWaitingOnHuman(threadId: string, waiting: boolean): void {
    const turn = this.turns.get(threadId);
    if (!turn) return;
    turn.waitingOnHuman = waiting;
    turn.lastEventAt = this.now();
  }

  setWaitingOnComputer(threadId: string, waiting: boolean): void {
    const turn = this.turns.get(threadId);
    if (!turn) return;
    turn.waitingOnComputer = waiting;
    turn.lastEventAt = this.now();
  }

  settle(threadId: string): void {
    this.turns.delete(threadId);
  }

  /** A Stop that discards the turn's later events leaves no way for a tool or a wait to report its end: watch the teardown as a fresh silent turn. */
  eventsDiscarded(threadId: string): void {
    const turn = this.turns.get(threadId);
    if (turn) this.watch(threadId, turn.botId);
  }

  fail(threadId: string, reason: StallReason = "server-error"): boolean {
    const turn = this.turns.get(threadId);
    if (!turn) return false;
    this.turns.delete(threadId);
    this.opts.onStall(turn, this.now() - turn.lastEventAt, reason);
    return true;
  }

  watching(threadId: string): boolean {
    return this.turns.has(threadId);
  }

  waiting(threadId: string): boolean {
    const turn = this.turns.get(threadId);
    return turn !== undefined && parked(turn);
  }

  /** A turn of this bot is answering now: running and not parked on a person or a computer. One that goes silent is
   * stopped by the sweep, so this never holds anything for longer than toolStallMs without events or a command's CPU use. */
  answering(botId: string): boolean {
    for (const turn of this.turns.values()) if (turn.botId === botId && !parked(turn)) return true;
    return false;
  }

  sweep(sleptMs = 0): void {
    const at = this.now();
    for (const turn of this.turns.values()) {
      if (sleptMs) turn.lastEventAt = Math.min(at, turn.lastEventAt + sleptMs);
      const limit = this.silenceLimit(turn);
      if (limit === null) continue;
      const { ms: silentMs, reason } = limit;
      if (at - turn.lastEventAt >= this.opts.stallMs) this.readCommandCpu(turn);
      if (at - turn.lastEventAt < silentMs) continue;
      this.turns.delete(turn.threadId);
      this.opts.onStall(turn, silentMs, reason);
    }
    this.freeUnheld(at);
  }

  private silenceLimit(turn: WatchedTurn): { ms: number; reason: StallReason } | null {
    if (parked(turn)) return this.opts.engineGone?.(turn) ? { ms: this.opts.parkedStallMs ?? (1_000 * this.opts.stallMs), reason: "silent" } : null;
    if (this.opts.engineExited?.(turn)) return { ms: this.opts.engineExitStallMs ?? ENGINE_EXIT_STALL_MS, reason: "engine-exited" };
    return { ms: turn.runningTools.size > 0 ? Math.max(this.opts.stallMs, this.opts.toolStallMs) : this.opts.stallMs, reason: "silent" };
  }

  private readCommandCpu(turn: WatchedTurn): void {
    const read = this.opts.commandCpuMs, command = parked(turn) ? undefined : oldestCommand(turn);
    if (!read || !command) return;
    const last = this.cpu.get(turn);
    if (last?.reading) return;
    const since = command.startedAt, previous = last?.since === since ? last.ms : null;
    this.cpu.set(turn, { since, ms: previous, reading: true });
    void Promise.resolve().then(() => read(turn, since)).catch(() => null).then((ms) => {
      this.cpu.set(turn, { since, ms: ms ?? previous, reading: false });
      if (ms !== null && previous !== null && ms !== previous && this.turns.get(turn.threadId) === turn) turn.lastEventAt = Math.max(turn.lastEventAt, this.now());
    });
  }

  private freeUnheld(at: number): void {
    const unheld = this.opts.unheld;
    if (!unheld) return;
    const still = new Map<string, number>();
    for (const { threadId, botId } of unheld.threads()) {
      if (this.turns.has(threadId)) continue;
      const since = this.unheldSince.get(threadId) ?? at;
      if (at - since < this.opts.stallMs) still.set(threadId, since);
      else unheld.free(threadId, botId);
    }
    this.unheldSince = still;
  }
}
