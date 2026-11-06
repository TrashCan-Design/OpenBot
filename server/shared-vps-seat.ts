import type { ComputerControl } from "./computer-control.ts";
import { sharedVpsControlKey, sharedVpsResource } from "./shared-vps.ts";
import { TurnResources, type TurnOwner } from "./turn-resources.ts";

const TAKE_TIMEOUT_MS = 120_000;
const LEASE_IDLE_MS = 10 * 60_000;

type Seat = { owner: TurnOwner; session: string; timer: ReturnType<typeof setTimeout> };

/** Shared VPS person control participates in the same FIFO desktop queue as bot turns. */
export class SharedVpsSeat {
  private readonly seats = new Map<string, Seat>();
  private readonly resources: TurnResources;
  private readonly control: ComputerControl;
  private readonly onRelease: (alias: string) => void;

  constructor(resources: TurnResources, control: ComputerControl, onRelease: (alias: string) => void = () => {}) {
    this.resources = resources;
    this.control = control;
    this.onRelease = onRelease;
  }

  private owner(alias: string, lease: string): TurnOwner {
    return { threadId: `shared-vps-person:${alias}`, generation: lease };
  }

  owns(alias: string, lease: string, session?: string): boolean {
    if (session && this.seats.get(alias)?.session !== session) return false;
    return this.resources.owns(sharedVpsResource(alias), this.owner(alias, lease)) &&
      this.control.ownsLease(sharedVpsControlKey(alias), lease);
  }

  allows(alias: string, session: string): boolean {
    const seat = this.seats.get(alias);
    return Boolean(seat && seat.session === session && this.owns(alias, seat.owner.generation));
  }

  touch(alias: string, lease: string, session?: string): void {
    if (!this.owns(alias, lease, session)) return;
    const seat = this.seats.get(alias);
    if (!seat) return;
    clearTimeout(seat.timer);
    seat.timer = setTimeout(() => this.release(alias, lease), LEASE_IDLE_MS);
    seat.timer.unref?.();
  }

  touchCurrent(alias: string): void {
    const seat = this.seats.get(alias);
    if (seat) this.touch(alias, seat.owner.generation);
  }

  async take(alias: string, lease: string, signal?: AbortSignal, session = "loopback"): Promise<{ held: boolean; owned: boolean; acquired: boolean }> {
    if (this.owns(alias, lease, session)) {
      this.touch(alias, lease);
      return { held: true, owned: true, acquired: false };
    }
    if (this.control.snapshot(sharedVpsControlKey(alias)).held) {
      throw Object.assign(new Error("The shared desktop is controlled by another session"), { status: 409 });
    }
    const resource = sharedVpsResource(alias);
    const owner = this.owner(alias, lease);
    const deadline = Date.now() + TAKE_TIMEOUT_MS;
    this.resources.startWaiting(resource, owner);
    // Release only a claim this attempt made and did not keep. Another take of this lease matches by id, not by this object.
    let releaseClaim = false;
    try {
      while (Date.now() < deadline && !signal?.aborted) {
        if (this.owns(alias, lease, session)) return { held: true, owned: true, acquired: false };
        if (this.control.snapshot(sharedVpsControlKey(alias)).held) {
          throw Object.assign(new Error("The shared desktop is controlled by another session"), { status: 409 });
        }
        if (this.resources.claim(resource, owner)) {
          releaseClaim = true;
          if (signal?.aborted) break;
          const acquired = this.control.acquireLease(sharedVpsControlKey(alias), lease);
          if (!acquired.owned) break;
          const timer = setTimeout(() => this.release(alias, lease), LEASE_IDLE_MS);
          timer.unref?.();
          this.seats.set(alias, { owner, session, timer });
          releaseClaim = false;
          return { held: true, owned: true, acquired: acquired.acquired };
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, 100);
          const aborted = () => { clearTimeout(timer); done(); };
          function done() { signal?.removeEventListener("abort", aborted); resolve(); }
          signal?.addEventListener("abort", aborted, { once: true });
        });
      }
      throw Object.assign(new Error(signal?.aborted ? "Desktop control request cancelled" : "Timed out waiting for the shared desktop"), { status: signal?.aborted ? 499 : 409 });
    } finally {
      this.resources.stopWaiting(resource, owner);
      if (releaseClaim) this.resources.releaseOne(resource, owner);
    }
  }

  async respond(alias: string, action: string, lease: string | undefined, session: string, changing: boolean, closed: () => boolean, signal: AbortSignal): Promise<{ status: number; body: Record<string, unknown> } | null> {
    const key = sharedVpsControlKey(alias);
    if (action === "take") {
      if (!lease) return { status: 400, body: { error: "Shared desktop control requires a control lease" } };
      if (changing) return { status: 409, body: { error: "The shared VPS desktop is being changed; wait before taking control" } };
      const result = await this.take(alias, lease, signal, session);
      if (signal.aborted || closed()) {
        this.release(alias, lease, session);
        return null;
      }
      return { status: 200, body: { ...this.control.snapshot(key), ...result } };
    }
    if (action === "release") {
      const released = this.release(alias, lease, session);
      return { status: 200, body: { ...this.control.snapshot(key), released } };
    }
    if (action === "check" && lease) {
      this.touch(alias, lease, session);
      return { status: 200, body: { ...this.control.snapshot(key), owned: this.owns(alias, lease, session) } };
    }
    return { status: 400, body: { error: "action must be take, release, or check" } };
  }

  release(alias: string, lease?: string, session?: string): boolean {
    const seat = this.seats.get(alias);
    if (!seat || (lease && seat.owner.generation !== lease) || (session && seat.session !== session)) return false;
    this.seats.delete(alias);
    clearTimeout(seat.timer);
    this.control.releaseLease(sharedVpsControlKey(alias), seat.owner.generation);
    this.resources.releaseOne(sharedVpsResource(alias), seat.owner);
    this.onRelease(alias);
    return true;
  }

  close(): void {
    for (const alias of this.seats.keys()) this.release(alias);
  }
}
