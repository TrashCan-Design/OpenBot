import { redactSecretsInText } from "../shared/redact.ts";
import type { RuntimeEvent } from "./contracts.ts";

// A turn whose thread emits nothing for stallMs is wedged; waiting on a person or a computer is not a stall.
// Drivers report a tool only when it starts and when it ends, so a turn with a tool running may stay silent for toolStallMs.
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

/** What the person is told when the watchdog stops a turn silent for silentMs: the shell command still running, with how
 * long it ran, so they know what looked stuck; otherwise how long the turn was silent. */
export function stallNotice(turn: Partial<Pick<WatchedTurn, "runningTools">>, silentMs: number, stopAt: number) {
  const stuck = stuckCommand(turn, stopAt);
  return stuck
    ? { key: "chat.notice.stalledCommand" as const, params: stuck }
    : { key: "chat.notice.stalled" as const, params: { minutes: Math.round(silentMs / 60_000) } };
}

// Number() also reads "Infinity" and "1e309" as numbers, and an endless limit would switch the watchdog off.
export function stallLimitMs(raw: string | undefined, fallback: number): number {
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : fallback;
}

const parked = (turn: WatchedTurn): boolean => turn.waitingOnHuman || turn.waitingOnComputer;
const SUSPENDED_SWEEPS = 3;

export interface TurnWatchdogOptions {
  stallMs: number;
  toolStallMs: number;
  checkMs: number;
  /** silentMs: the silence that stopped the turn, stallMs or toolStallMs. */
  onStall: (turn: WatchedTurn, silentMs: number) => void;
  now?: () => number;
}

export class TurnWatchdog {
  private turns = new Map<string, WatchedTurn>();
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

  watching(threadId: string): boolean {
    return this.turns.has(threadId);
  }

  waiting(threadId: string): boolean {
    const turn = this.turns.get(threadId);
    return turn !== undefined && parked(turn);
  }

  /** A turn of this bot is answering now: running and not parked on a person or a computer. One that goes silent is
   * stopped by the sweep, so this never holds anything for longer than toolStallMs without events. */
  answering(botId: string): boolean {
    for (const turn of this.turns.values()) if (turn.botId === botId && !parked(turn)) return true;
    return false;
  }

  sweep(sleptMs = 0): void {
    const at = this.now();
    for (const turn of this.turns.values()) {
      if (sleptMs) turn.lastEventAt = Math.min(at, turn.lastEventAt + sleptMs);
      if (parked(turn)) continue;
      const silentMs = turn.runningTools.size > 0 ? Math.max(this.opts.stallMs, this.opts.toolStallMs) : this.opts.stallMs;
      if (at - turn.lastEventAt < silentMs) continue;
      this.turns.delete(turn.threadId);
      this.opts.onStall(turn, silentMs);
    }
  }
}
