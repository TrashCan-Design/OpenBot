import { describe, expect, it, vi } from "vitest";
import { ComputerControl } from "./computer-control.ts";
import { sharedVpsOwnerId, sharedVpsResource, vpsDesktopOwnerId } from "./shared-vps.ts";
import { SharedVpsSeat } from "./shared-vps-seat.ts";
import { TurnResources } from "./turn-resources.ts";

const alias = "gcp-desktop";
const resource = sharedVpsResource(alias);
const person = "a".repeat(20);

describe("shared VPS desktop ownership", () => {
  it("uses one stable per-host container for multiple bots and preserves per-bot names", () => {
    const alpha = { id: "alpha", vpsDesktopMode: "shared" as const };
    const beta = { id: "beta", vpsDesktopMode: "shared" as const };
    expect(vpsDesktopOwnerId(alpha, alias)).toBe(sharedVpsOwnerId(alias));
    expect(vpsDesktopOwnerId(beta, alias)).toBe(vpsDesktopOwnerId(alpha, alias));
    expect(vpsDesktopOwnerId(alpha, "another-host")).not.toBe(vpsDesktopOwnerId(alpha, alias));
    expect(vpsDesktopOwnerId({ id: "alpha" }, alias)).toBe("alpha");
  });

  it("queues a person behind an active bot and ahead of the next bot", async () => {
    const resources = new TurnResources();
    const control = new ComputerControl();
    const seat = new SharedVpsSeat(resources, control);
    const alpha = { threadId: "alpha", generation: "one" };
    const beta = { threadId: "beta", generation: "two" };
    expect(resources.claim(resource, alpha)).toBe(true);
    const take = seat.take(alias, person);
    expect(resources.waiting(resource)).toHaveLength(1);
    expect(resources.startWaiting(resource, beta)).toBe(2);
    expect(resources.claim(resource, beta)).toBe(false);
    resources.release(alpha);
    expect(await take).toMatchObject({ held: true, owned: true });
    expect(resources.claim(resource, beta)).toBe(false);
    expect(seat.owns(alias, person)).toBe(true);
    expect(seat.release(alias, "wrong")).toBe(false);
    expect(seat.release(alias, person)).toBe(true);
    expect(resources.claim(resource, beta)).toBe(true);
    resources.release(beta);
    seat.close();
  });

  it("cancels a queued request without leaving a stale waiter", async () => {
    const resources = new TurnResources();
    const seat = new SharedVpsSeat(resources, new ComputerControl());
    const bot = { threadId: "alpha", generation: "one" };
    resources.claim(resource, bot);
    const cancellation = new AbortController();
    const take = seat.take(alias, person, cancellation.signal);
    expect(resources.waiting(resource)).toHaveLength(1);
    cancellation.abort();
    await expect(take).rejects.toThrow(/cancelled/);
    expect(resources.waiting(resource)).toHaveLength(0);
    resources.release(bot);
    expect(resources.claim(resource, { threadId: "beta", generation: "two" })).toBe(true);
    seat.close();
  });

  it("expires an abandoned human lease and releases its viewer", async () => {
    vi.useFakeTimers();
    const resources = new TurnResources();
    const released: string[] = [];
    const seat = new SharedVpsSeat(resources, new ComputerControl(), value => released.push(value));
    try {
      await seat.take(alias, person);
      expect(seat.owns(alias, person)).toBe(true);
      vi.advanceTimersByTime(9 * 60_000);
      seat.touchCurrent(alias);
      vi.advanceTimersByTime(9 * 60_000);
      expect(seat.owns(alias, person)).toBe(true);
      vi.advanceTimersByTime(60_001);
      expect(seat.owns(alias, person)).toBe(false);
      expect(resources.holder(resource)).toBeUndefined();
      expect(released).toEqual([alias]);
    } finally {
      seat.close();
      vi.useRealTimers();
    }
  });

  it("does not let a different signed-in session release or view the current seat", async () => {
    const seat = new SharedVpsSeat(new TurnResources(), new ComputerControl());
    await seat.take(alias, person, undefined, "session-one");
    expect(seat.allows(alias, "session-one")).toBe(true);
    expect(seat.allows(alias, "session-two")).toBe(false);
    expect(seat.release(alias, person, "session-two")).toBe(false);
    expect(seat.owns(alias, person, "session-one")).toBe(true);
    expect(await seat.take(alias, person, undefined, "session-one")).toMatchObject({ held: true, owned: true, acquired: false });
    expect(seat.release(alias, person, "session-one")).toBe(true);
    seat.close();
  });
});
