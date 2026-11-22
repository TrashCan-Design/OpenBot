import { approvalModeFor, levelWithin, modelSwitchNeedsAsk, type ApprovalMode } from "../../shared/approval-mode.ts";
import type { ModelSelection } from "../../shared/wire.ts";
import type { BotRecord, Store } from "../store.ts";
import type { NewThreadLevel } from "../task-record.ts";

export interface SpawnLevelDeps {
  store: Pick<Store, "taskByThread" | "projectBotForTask">;
  driverKind(instanceId: string): string | undefined;
  /** The level a turn in that conversation runs at, its floors applied: a guest's, a Bot API key's or a fenced turn runs at Ask. */
  sourceLevel(botId: string, threadId: string): ApprovalMode;
  /** Whoever drives that conversation may set a level there: not work from outside, nor a guest or anyone but the owner on a
   * Cloud, nor a hosted workspace without its operator's policy. Lowering needs no one. */
  mayRaise(threadId: string): boolean;
}

/** The conversation a thread is opened from. A room's thread is never one: a room keeps no level of its own. */
export type Opener = { botId: string; threadId: string };

export function createSpawnLevel(deps: SpawnLevelDeps) {
  const { store } = deps;
  const needsAsk = (mode: ApprovalMode, from: ModelSelection, to: ModelSelection) =>
    modelSwitchNeedsAsk(mode, deps.driverKind(from.instanceId), deps.driverKind(to.instanceId));

  /** What a new thread of `target` on `selection` saves: `from`'s level when that conversation has a settled one of its own and
   * it differs from `target`'s, capped by the engine the thread runs on; undefined starts it at `target`'s own (task-record.ts). */
  return function levelFor(target: BotRecord, selection: ModelSelection = target.modelSelection, from?: Opener): NewThreadLevel | undefined {
    const own = approvalModeFor({ ...target, approvalGrant: undefined });
    const ownCarries = needsAsk(own, target.modelSelection, selection) ? "ask" as const : undefined;
    const task = from && store.taskByThread(from.botId, from.threadId);
    const view = from && store.projectBotForTask(from.botId, from.threadId);
    if (!from || !task || !view || view.approvalGrant || task.routineRunId || (task.approvalMode === undefined && task.autoApprove === undefined) ||
      (target.approvalGrant && !target.approvalGrant.threadOnly)) return ownCarries;
    const chosen = approvalModeFor(view);
    const runs = deps.sourceLevel(from.botId, from.threadId);
    if (runs !== chosen) return "ask";
    const level: ApprovalMode = chosen === "custom" && (own !== "custom" || from.botId !== target.id) ? "ask" : chosen;
    if (level === own || own === "custom") return ownCarries;
    if (!levelWithin(level, own) && !deps.mayRaise(from.threadId)) return ownCarries;
    return needsAsk(level, view.modelSelection, selection) ? "ask" : { from: level };
  };
}
