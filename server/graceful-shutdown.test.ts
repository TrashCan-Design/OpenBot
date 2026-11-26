import { describe, expect, it, vi } from "vitest";

import { createGracefulShutdown, SHUTDOWN_DEADLINE_MS } from "./graceful-shutdown.ts";

describe("createGracefulShutdown", () => {
  it("waits for capability and provider cleanup and only starts once", async () => {
    let finishCapabilities!: () => void;
    let finishProviders!: () => void;
    const capabilities = new Promise<void>((resolve) => { finishCapabilities = resolve; });
    const providers = new Promise<void>((resolve) => { finishProviders = resolve; });
    const capabilityCleanup = vi.fn(() => capabilities);
    const providerCleanup = vi.fn(() => providers);
    const exit = vi.fn();
    const shutdown = createGracefulShutdown({
      cleanup: [capabilityCleanup, providerCleanup],
      exit,
      timeoutMs: 5_000,
    });

    shutdown();
    shutdown();
    await Promise.resolve();
    expect(capabilityCleanup).toHaveBeenCalledOnce();
    expect(providerCleanup).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();

    finishCapabilities();
    await Promise.resolve();
    expect(exit).not.toHaveBeenCalled();
    finishProviders();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it("uses the deadline when cleanup is wedged", async () => {
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      const shutdown = createGracefulShutdown({
        cleanup: [() => new Promise<void>(() => {})],
        exit,
        timeoutMs: 50,
      });
      shutdown();
      await vi.advanceTimersByTimeAsync(49);
      expect(exit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("continues sibling cleanup and exits 0 when jobs throw synchronously or reject", async () => {
    let finishSibling!: () => void;
    const sibling = new Promise<void>((resolve) => { finishSibling = resolve; });
    const exit = vi.fn();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const shutdown = createGracefulShutdown({
        cleanup: [
          () => { throw new Error("sync boom"); },
          () => Promise.reject(new Error("async boom")),
          () => sibling,
        ],
        exit,
        timeoutMs: 5_000,
      });

      shutdown();
      await Promise.resolve();
      await Promise.resolve();
      expect(exit).not.toHaveBeenCalled();

      finishSibling();
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("exits immediately and clears the deadline timer when cleanup is empty", async () => {
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      const shutdown = createGracefulShutdown({
        cleanup: [],
        exit,
        timeoutMs: SHUTDOWN_DEADLINE_MS,
      });
      shutdown();
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("absorbs a late cleanup rejection after the deadline expires", async () => {
    vi.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      let rejectLate!: (err: Error) => void;
      const exit = vi.fn();
      const shutdown = createGracefulShutdown({
        cleanup: [() => new Promise<void>((_resolve, reject) => { rejectLate = reject; })],
        exit,
        timeoutMs: 50,
      });
      shutdown();
      await vi.advanceTimersByTimeAsync(50);
      expect(exit).toHaveBeenCalledWith(0);

      rejectLate(new Error("late failure"));
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
    }
  });
});
