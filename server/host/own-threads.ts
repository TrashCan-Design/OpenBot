import type { ModelSelection } from "../../shared/wire.ts";
import type { BotRecord, Store } from "../store.ts";
import type { NewThreadLevel } from "../task-record.ts";
import type { ThreadModelFallback } from "../thread-model.ts";
import { createSpawnLevel, type SpawnLevelDeps } from "./spawn-level.ts";

type Placed = { botId: string; threadId: string; groupId?: string };
type Node = Omit<Placed, "threadId"> & { parentId?: string };

export function createOwnThreads(deps: Pick<SpawnLevelDeps, "sourceLevel" | "mayRaise"> & {
  store: Pick<Store, "bot" | "taskByThread" | "projectBotForTask">;
  registry: { instances?(): readonly unknown[]; cliTarget(instanceId: string): { driverKind: string } | null | undefined };
  node(id: string): Node | undefined;
  current(botId: string, threadId: string): ModelSelection | undefined;
  proposalRefusal(selection: ModelSelection, bot: BotRecord): string | null;
  givesWay(selection: ModelSelection, botModel: ModelSelection): ThreadModelFallback | null;
  modelName(selection: ModelSelection): string;
}) {
  const { store } = deps;
  const levelFor = createSpawnLevel({ ...deps, driverKind: (instanceId) => deps.registry.cliTarget(instanceId)?.driverKind });
  const own = (requester: Omit<Placed, "threadId">, child: Omit<Placed, "threadId">) =>
    requester.botId === child.botId && !requester.groupId && !child.groupId;
  const cannotRun = (selection: ModelSelection, bot: BotRecord): string | null => {
    const givesWay = deps.givesWay(selection, bot.modelSelection);
    return givesWay && `${deps.modelName(selection)} can't run now: ${givesWay === "signed-out" ? "it is signed out" : "its engine is unavailable"}.`;
  };
  const refusal = (selection: ModelSelection, bot: BotRecord): string | null => deps.proposalRefusal(selection, bot) ?? cannotRun(selection, bot);
  return {
    own,
    refusal,
    swapRefusal(bot: BotRecord, threadId: string): string | null {
      const chosen = store.taskByThread(bot.id, threadId)?.modelSelection;
      const reason = chosen && cannotRun(chosen, bot);
      return reason ? `${reason} Nothing ran on another model in its place; open it again on a model list_models offers.` : null;
    },
    steersOwn(thread: string, botId: string, fromThreadId: string): boolean {
      const openedBy = thread === "new" || thread === "standing" ? undefined : store.taskByThread(botId, thread)?.openedBy;
      return openedBy?.botId === botId && openedBy.threadId === fromThreadId && openedBy.kind === undefined && !openedBy.roomLane;
    },
    answersOwn(answers: string | undefined, botId: string): boolean {
      const asked = answers === undefined ? undefined : deps.node(answers);
      const requester = asked?.parentId === undefined ? undefined : deps.node(asked.parentId);
      return Boolean(asked && requester && requester.botId === botId && own(requester, asked));
    },
    levelFor,
    approvalFor(bot: BotRecord, selection: ModelSelection, fromThreadId?: string): NewThreadLevel | undefined {
      return levelFor(bot, selection, fromThreadId === undefined ? undefined : { botId: bot.id, threadId: fromThreadId });
    },
    inherited(botId: string, parentThreadId: string, picked?: ModelSelection): { modelSelection?: ModelSelection; approvalMode?: NewThreadLevel } {
      const bot = store.bot(botId);
      if (!bot) return {};
      const modelSelection = picked ?? store.taskByThread(bot.id, parentThreadId)?.modelSelection;
      const approvalMode = levelFor(bot, modelSelection, { botId, threadId: parentThreadId });
      return { ...(modelSelection ? { modelSelection } : {}), ...(approvalMode ? { approvalMode } : {}) };
    },
    name(requester: Omit<Placed, "threadId">, child: Placed): string | undefined {
      return own(requester, child) ? `#${store.taskByThread(child.botId, child.threadId)?.title ?? "Thread"}` : undefined;
    },
    label(child: Placed): string {
      const task = store.taskByThread(child.botId, child.threadId);
      return ` (your thread #${task?.title ?? "Thread"}${task?.modelSelection ? `, on ${task.modelSelection.model}` : ""})`;
    },
  };
}
