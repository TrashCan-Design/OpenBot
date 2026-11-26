import { describe, expect, it } from "vitest";

import { currentTurn, outsideTurn, runInTurn } from "./crash-guard.ts";

describe("crash-guard turn scope", () => {
  it("returns undefined outside any turn", () => {
    expect(currentTurn()).toBeUndefined();
  });

  it("propagates turn scope across async continuations and isolates concurrent turns", async () => {
    const first = runInTurn({ botId: "bot-a", threadId: "thread-1" }, async () => {
      expect(currentTurn()).toEqual({ botId: "bot-a", threadId: "thread-1" });
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return currentTurn();
    });
    const second = runInTurn({ botId: "bot-b", threadId: "thread-2" }, async () => {
      expect(currentTurn()).toEqual({ botId: "bot-b", threadId: "thread-2" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      return currentTurn();
    });

    expect(currentTurn()).toBeUndefined();
    expect(await first).toEqual({ botId: "bot-a", threadId: "thread-1" });
    expect(await second).toEqual({ botId: "bot-b", threadId: "thread-2" });
  });

  it("restores the outer scope after nested runInTurn and outsideTurn, even on throw", async () => {
    const outer = { botId: "bot-outer", threadId: "t-outer" };
    const inner = { botId: "bot-inner", threadId: "t-inner" };

    await runInTurn(outer, async () => {
      expect(currentTurn()).toEqual(outer);

      expect(() =>
        runInTurn(inner, () => {
          expect(currentTurn()).toEqual(inner);
          throw new Error("inner failed");
        }),
      ).toThrow("inner failed");
      expect(currentTurn()).toEqual(outer);

      const escaped = await outsideTurn(async () => {
        expect(currentTurn()).toBeUndefined();
        await Promise.resolve();
        return currentTurn();
      });
      expect(escaped).toBeUndefined();
      expect(currentTurn()).toEqual(outer);

      expect(() =>
        outsideTurn(() => {
          expect(currentTurn()).toBeUndefined();
          throw new Error("listener failed");
        }),
      ).toThrow("listener failed");
      expect(currentTurn()).toEqual(outer);
    });

    expect(currentTurn()).toBeUndefined();
  });
});
