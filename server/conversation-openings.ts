// A send id that opens a conversation is the same id that submits the message, and it is remembered on disk.
// A retry whose first answer was lost, or a second caller still in flight, gets that conversation instead of a new one.
import { readFileSync } from "node:fs";

import { writeFileAtomic } from "./atomic.ts";
import { parseSendId } from "./send-idempotency.ts";

export type OpeningOwner = "bot" | "channel";

export interface Opening {
  sendId: string;
  owner: OpeningOwner;
  ownerId: string;
  threadId: string;
  title: string;
}

type Claim =
  | { ok: true; threadId: string; replayed: boolean }
  | { ok: false; status: number; error: string };

const MAX_OPENINGS = 2_000;

export class OpeningBook {
  private readonly rows = new Map<string, Opening>();
  private readonly flight = new Map<string, Promise<Opening>>();
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.load();
  }

  async claim(
    input: { sendId: string; owner: OpeningOwner; ownerId: string; title: string },
    create: () => Promise<{ threadId: string } | null> | { threadId: string } | null,
    alive: (threadId: string) => boolean,
  ): Promise<Claim> {
    const ready = this.ready(input, alive);
    if (ready) return ready;
    const pending = this.flight.get(input.sendId);
    if (pending) return this.after(input, alive, pending);
    const work = this.create(input, create);
    this.flight.set(input.sendId, work);
    try {
      await work;
      return { ok: true, threadId: (await work).threadId, replayed: false };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status) return { ok: false, status, error: error instanceof Error ? error.message : "couldn't create that task" };
      throw error;
    } finally {
      if (this.flight.get(input.sendId) === work) this.flight.delete(input.sendId);
    }
  }

  private async after(input: { sendId: string; owner: OpeningOwner; ownerId: string; title: string }, alive: (threadId: string) => boolean, pending: Promise<Opening>): Promise<Claim> {
    try {
      await pending;
    } catch {
      return this.ready(input, alive) ?? { ok: false, status: 500, error: "couldn't create that task" };
    }
    return this.ready(input, alive) ?? { ok: false, status: 500, error: "couldn't create that task" };
  }

  private ready(input: { sendId: string; owner: OpeningOwner; ownerId: string; title: string }, alive: (threadId: string) => boolean): Claim | undefined {
    const found = this.rows.get(input.sendId);
    if (!found) return undefined;
    if (found.owner !== input.owner || found.ownerId !== input.ownerId || found.title !== input.title) {
      return { ok: false, status: 409, error: "sendId already belongs to another conversation" };
    }
    if (!alive(found.threadId)) return { ok: false, status: 409, error: "that conversation was removed; choose a new send id" };
    return { ok: true, threadId: found.threadId, replayed: true };
  }

  private async create(input: { sendId: string; owner: OpeningOwner; ownerId: string; title: string }, create: () => Promise<{ threadId: string } | null> | { threadId: string } | null): Promise<Opening> {
    const again = this.rows.get(input.sendId);
    if (again) return again;
    const task = await create();
    if (!task) throw Object.assign(new Error("couldn't create that task"), { status: 500 });
    const opening: Opening = { ...input, threadId: task.threadId };
    this.rows.set(input.sendId, opening);
    while (this.rows.size > MAX_OPENINGS) {
      const oldest = this.rows.keys().next().value;
      if (oldest === undefined) break;
      this.rows.delete(oldest);
    }
    try {
      writeFileAtomic(this.file, JSON.stringify({ version: 1, openings: [...this.rows.values()] }), { mode: 0o600 });
    } catch (error) {
      console.warn("[openings] could not save the send id:", error instanceof Error ? error.message : error);
    }
    return opening;
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as { openings?: Opening[] };
      for (const opening of parsed.openings ?? []) {
        if (opening && typeof opening.sendId === "string" && typeof opening.threadId === "string") this.rows.set(opening.sendId, opening);
      }
    } catch {
      // A missing file is the first run. A torn file must not block conversations that name no send id.
    }
  }
}

const books = new Map<string, OpeningBook>();

export function openingBook(file: string): OpeningBook {
  const existing = books.get(file);
  if (existing) return existing;
  const book = new OpeningBook(file);
  books.set(file, book);
  return book;
}

export function readOpeningSendId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw Object.assign(new Error("sendId must be a client-generated id"), { status: 400 });
  return parseSendId(value);
}
