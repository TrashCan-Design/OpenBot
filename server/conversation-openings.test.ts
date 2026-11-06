import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { OpeningBook } from "./conversation-openings.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const SEND = "cli-retry-same-id";

function book() {
  const dir = mkdtempSync(join(tmpdir(), "omb-openings-"));
  dirs.push(dir);
  const file = join(dir, "conversation-openings.json");
  return { openings: new OpeningBook(file), file };
}

describe("conversation openings", () => {
  it("returns the same conversation for a sequential retry and a lost response", async () => {
    const { openings, file } = book();
    let made = 0;
    const create = () => ({ threadId: `t${++made}` });
    const alive = () => true;
    const input = { sendId: SEND, owner: "bot" as const, ownerId: "lead", title: "Plan" };
    const first = await openings.claim(input, create, alive);
    expect(first).toEqual({ ok: true, threadId: "t1", replayed: false });
    const lost = await openings.claim(input, create, alive);
    expect(lost).toEqual({ ok: true, threadId: "t1", replayed: true });
    expect(made).toBe(1);
    const reloaded = new OpeningBook(file);
    expect(await reloaded.claim(input, create, alive)).toEqual({ ok: true, threadId: "t1", replayed: true });
    expect(made).toBe(1);
  });

  it("keeps one conversation when two retries are in flight, and refuses a different message", async () => {
    const { openings } = book();
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    let made = 0;
    const create = async () => {
      made += 1;
      await gate;
      return { threadId: "only" };
    };
    const input = { sendId: SEND, owner: "channel" as const, ownerId: "room", title: "Plan" };
    const first = openings.claim(input, create, () => true);
    const second = openings.claim(input, create, () => true);
    const other = openings.claim({ ...input, title: "Other" }, create, () => true);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, threadId: "only", replayed: false },
      { ok: true, threadId: "only", replayed: true },
    ]);
    await expect(other).resolves.toMatchObject({ ok: false, status: 409 });
    expect(made).toBe(1);
  });

  it("does not open a replacement after the conversation was removed", async () => {
    const { openings } = book();
    await openings.claim({ sendId: SEND, owner: "bot", ownerId: "lead", title: "Plan" }, () => ({ threadId: "gone" }), () => true);
    const retry = await openings.claim({ sendId: SEND, owner: "bot", ownerId: "lead", title: "Plan" }, () => ({ threadId: "new" }), () => false);
    expect(retry).toMatchObject({ ok: false, status: 409 });
  });
});
