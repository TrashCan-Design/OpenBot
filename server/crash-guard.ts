import { AsyncLocalStorage } from "node:async_hooks";

export interface TurnScope { botId: string; threadId: string }

const scope = new AsyncLocalStorage<TurnScope>();

/** Runs a turn's work so that an error nothing catches inside it, however late, is known to be that turn's. */
export const runInTurn = <T>(turn: TurnScope, run: () => T): T => scope.run(turn, run);
export const currentTurn = (): TurnScope | undefined => scope.getStore();
/** Runs server code a driver calls into (its event listeners) outside any turn's scope. */
export const outsideTurn = <T>(run: () => T): T => scope.exit(run);
