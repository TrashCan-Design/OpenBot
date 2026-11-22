// The databases a full backup carries are taken whole, as the server would read them: every SQLite database by the
// snapshot SQLite makes while a writer goes on.
import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { openRuntimeStore } from "./runtime/store.ts";
import { applyPendingWorkspaceRestore, commitPendingWorkspaceRestore, createWorkspaceBackup, stageWorkspaceBackup } from "./workspace-backup.ts";
import { ONE_STEP, snapshotDatabases } from "./workspace-backup-databases.ts";

const PASSWORD = "correct horse battery staple";
const TIMEOUT_MS = 120_000;
const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });
const directory = () => { const path = mkdtempSync(join(tmpdir(), "openbot-backup-databases-")); scratch.push(path); return path; };

const PAD = "x".repeat(2_000);
/** A database as the server keeps it: WAL mode, its rows still in the WAL, and a connection that goes on writing. */
function liveDatabase(path: string, schema: string, insert: string, rows: number) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA wal_autocheckpoint = 0");
  db.exec(schema);
  const statement = db.prepare(insert);
  let next = 0;
  const write = () => { statement.run(next, PAD); next++; };
  db.exec("BEGIN");
  for (let i = 0; i < rows; i++) write();
  db.exec("COMMIT");
  return { db, write, written: () => next };
}

/** The rows a restored database holds: whole (integrity), and every one from the first, none skipped. */
function rowsOf(path: string, sql: string): number {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    const ids = db.prepare(sql).all().map((row) => Number(Object.values(row)[0]));
    expect(ids).toEqual(ids.map((_, i) => i));
    return ids.length;
  } finally { db.close(); }
}

describe("SQLite databases in a full backup", () => {
  it("snapshots in one step at a rate every Node takes: a positive Int32", async () => {
    expect(Number.isInteger(ONE_STEP) && ONE_STEP >= 1 && ONE_STEP <= 2 ** 31 - 1).toBe(true);
    const root = directory(), snapshot = directory();
    liveDatabase(join(root, "bursts.db"), "CREATE TABLE probe(i INTEGER PRIMARY KEY, pad TEXT)", "INSERT INTO probe VALUES (?, ?)", 20).db.close();
    await snapshotDatabases(root, snapshot);
    expect(rowsOf(join(snapshot, "bursts-snapshot.db"), "SELECT i FROM probe ORDER BY i")).toBe(20);
  });

  it("restores each database whole and complete while a writer goes on inserting into it", async () => {
    const source = directory();
    // A big file before the databases keeps the copy going while the writers write.
    mkdirSync(join(source, "attachments"));
    writeFileSync(join(source, "attachments", "big.bin"), Buffer.alloc(32 * 1024 * 1024, 0x5a));
    openRuntimeStore(join(source, "runtime.db")).close();
    const live = [
      liveDatabase(join(source, "messages.db"),
        "CREATE TABLE messages(thread_id TEXT, id INTEGER, text TEXT, json TEXT, PRIMARY KEY(thread_id, id)); CREATE TABLE thread_state(thread_id TEXT PRIMARY KEY, active_leaf_id TEXT)",
        "INSERT INTO messages VALUES ('thread', ?, ?, '{}')", 400),
      liveDatabase(join(source, "runtime.db"), "CREATE TABLE probe(i INTEGER PRIMARY KEY, pad TEXT)", "INSERT INTO probe VALUES (?, ?)", 400),
      liveDatabase(join(source, "bursts.db"), "CREATE TABLE probe(i INTEGER PRIMARY KEY, pad TEXT)", "INSERT INTO probe VALUES (?, ?)", 400),
    ];
    let writing = true;
    const worker = (async () => {
      while (writing) {
        for (const item of live) item.write();
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();
    const backup = await createWorkspaceBackup(source, { password: PASSWORD, appVersion: "test" });
    writing = false;
    await worker;
    for (const item of live) item.db.close();

    const target = directory();
    const staged = await stageWorkspaceBackup(target, backup.path, { password: PASSWORD });
    commitPendingWorkspaceRestore(target, staged.id);
    expect(applyPendingWorkspaceRestore(target)).toMatchObject({ restored: true });

    expect(rowsOf(join(target, "messages.db"), "SELECT id FROM messages WHERE thread_id = 'thread' ORDER BY id")).toBeGreaterThanOrEqual(400);
    expect(rowsOf(join(target, "runtime.db"), "SELECT i FROM probe ORDER BY i")).toBeGreaterThanOrEqual(400);
    expect(rowsOf(join(target, "bursts.db"), "SELECT i FROM probe ORDER BY i")).toBeGreaterThanOrEqual(400);
    // Restored databases hold DELETE journal mode and have no lingering WAL sidecars
    for (const name of ["messages.db", "runtime.db", "bursts.db"]) {
      expect(existsSync(join(target, `${name}-wal`))).toBe(false);
      expect(existsSync(join(target, `${name}-shm`))).toBe(false);
    }
  }, TIMEOUT_MS);
});

function legacyBackup(source: string, out: string): string {
  const stage = join(out, "stage");
  const data = join(stage, "data");
  mkdirSync(data, { recursive: true });
  const entries: Array<{ path: string; type: "file" | "directory"; size: number; mode: number; sha256?: string }> = [];
  const walk = (rel = "") => {
    for (const name of readdirSync(join(source, rel)).sort()) {
      const p = rel ? `${rel}/${name}` : name;
      const s = join(source, p);
      const stat = lstatSync(s);
      if (stat.isDirectory()) {
        mkdirSync(join(data, p), { recursive: true });
        entries.push({ path: p, type: "directory", size: 0, mode: 0o700 });
        walk(p);
      } else if (stat.isFile()) {
        copyFileSync(s, join(data, p));
        entries.push({ path: p, type: "file", size: stat.size, mode: 0o600, sha256: createHash("sha256").update(readFileSync(s)).digest("hex") });
      }
    }
  };
  walk();
  const files = entries.filter((e) => e.type === "file");
  writeFileSync(join(stage, "manifest.json"), JSON.stringify({
    summary: { format: "openmaus.workspace-backup", version: 1, id: randomUUID(), createdAt: new Date().toISOString(), appVersion: "0.1.143",
      files: files.length, directories: entries.length - files.length, bytes: files.reduce((sum, entry) => sum + entry.size, 0),
      bots: 0, groups: 0, threads: 0, messages: 0, exclusions: [], warnings: [] },
    sourceDataDir: source, clientState: {}, entries,
  }));
  const tar = createRequire(import.meta.url)("tar") as typeof import("tar");
  const plain = join(out, "legacy.tar");
  tar.c({ cwd: stage, portable: true, strict: true, sync: true, file: plain }, ["manifest.json", "data"]);
  const salt = randomBytes(16), iv = randomBytes(12);
  const header = Buffer.concat([Buffer.from("OMB-WORKSPACE-1\n"), salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(PASSWORD, salt, 32, { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 ** 2 }), iv);
  cipher.setAAD(header);
  const path = join(out, "legacy.ombbackup");
  writeFileSync(path, Buffer.concat([header, cipher.update(readFileSync(plain)), cipher.final(), cipher.getAuthTag()]));
  return path;
}

describe("backups older releases made", () => {
  it("still restore: a raw bursts database and its WAL arrive as one database", async () => {
    const live = directory();
    const { db } = liveDatabase(join(live, "bursts.db"), "CREATE TABLE probe(i INTEGER PRIMARY KEY, pad TEXT)", "INSERT INTO probe VALUES (?, ?)", 50);
    const source = directory();
    try {
      for (const name of ["bursts.db", "bursts.db-wal", "bursts.db-shm"]) copyFileSync(join(live, name), join(source, name));
    } finally { db.close(); }
    mkdirSync(join(source, "bots", "b1"), { recursive: true });
    writeFileSync(join(source, "bots", "b1", "SOUL.md"), "Older soul.");
    writeFileSync(join(source, "notes.md"), "kept");
    const backup = legacyBackup(source, directory());
    const target = directory();
    mkdirSync(join(target, "bots", "b1"), { recursive: true });
    writeFileSync(join(target, "bursts.db-wal"), "destination log");
    const staged = await stageWorkspaceBackup(target, backup, { password: PASSWORD });
    commitPendingWorkspaceRestore(target, staged.id);
    const result = applyPendingWorkspaceRestore(target);
    expect(result).toMatchObject({ restored: true });
    expect(rowsOf(join(target, "bursts.db"), "SELECT i FROM probe ORDER BY i")).toBe(50);
    expect(readdirSync(target).filter((name) => name.startsWith("bursts.db")).sort()).toEqual(["bursts.db"]);
    expect(readFileSync(join(target, "notes.md"), "utf8")).toBe("kept");
    expect(readdirSync(join(target, "bots", "b1"))).toEqual(["SOUL.md"]);
  }, TIMEOUT_MS);

  it("refuses one whose bursts database is damaged with words a person can act on, changing nothing", async () => {
    const source = directory();
    writeFileSync(join(source, "bursts.db"), "not a database at all, but long enough to be read as a header by SQLite........");
    writeFileSync(join(source, "bursts.db-wal"), "nor a log");
    writeFileSync(join(source, "notes.md"), "kept");
    const backup = legacyBackup(source, directory());
    const target = directory();
    writeFileSync(join(target, "notes.md"), "here");
    const staged = await stageWorkspaceBackup(target, backup, { password: PASSWORD });
    expect(() => commitPendingWorkspaceRestore(target, staged.id)).toThrow(/damaged.*nothing was restored/);
    expect(applyPendingWorkspaceRestore(target)).toEqual({ restored: false });
    expect(readFileSync(join(target, "notes.md"), "utf8")).toBe("here");
  }, TIMEOUT_MS);
});
