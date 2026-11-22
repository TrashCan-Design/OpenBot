// The databases in the data folder a full backup carries, and how each is taken whole. A database the server keeps in
// WAL mode holds its newest rows in the -wal file beside it, and a copy of the two taken one after the other while a
// writer goes on is not one database: each is taken instead by SQLite's own snapshot, which reads one moment of it.
import { existsSync, lstatSync, rmSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

/** Each database the server keeps in WAL mode at the data folder's top, and the name of its snapshot. */
export const SNAPSHOT_DATABASES: Record<string, string> = {
  "messages.db": "messages-snapshot.db",
  "runtime.db": "runtime-snapshot.db",
  "bursts.db": "bursts-snapshot.db",
};

/** The pages a snapshot copies in one step: every page, as a positive Int32, which is all Node accepts. */
export const ONE_STEP = 2_147_483_647;
const LABELS: Record<string, string> = { "messages.db": "message", "runtime.db": "runtime", "bursts.db": "burst" };

/** The live WAL and shared-memory files of the snapshotted databases. */
export const LIVE_DATABASE_SIDECARS = new Set(Object.keys(SNAPSHOT_DATABASES).flatMap((name) => [`${name}-wal`, `${name}-shm`]));

/** Sidecars a backup leaves out, which older backups carried raw beside their database: they still restore, folded into it. */
export const LEGACY_SIDECARS = new Set(["bursts.db-wal", "bursts.db-shm"]);

/** One moment of each database, as `snapshot/<snapshot name>` in DELETE mode: never the live file and its log. */
export async function snapshotDatabases(root: string, snapshot: string): Promise<void> {
  for (const [name, snapshotName] of Object.entries(SNAPSHOT_DATABASES)) {
    const sourceDb = join(root, name);
    if (!existsSync(sourceDb)) continue;
    if (lstatSync(sourceDb).isSymbolicLink()) throw new Error(`The ${LABELS[name]} database must not be a symbolic link.`);
    // Another connection may open this database meanwhile; without a busy timeout the backup fails at once ("database is locked").
    const db = new DatabaseSync(sourceDb, { readOnly: true, timeout: 5_000 });
    // Node 26's native backup completion can wait on unrelated event-loop activity after an async scrypt; this pulse keeps it moving.
    const completionPulse = setInterval(() => {}, 25);
    // In one step: a backup in steps starts again whenever another connection writes between them, and a writer that keeps
    // writing would keep it from ever finishing. SQLite reads -1 as every page, but Node 24.22 refuses a rate under 1, so
    // the step is the largest rate Node takes, more pages than any database here holds.
    try { await backup(db, join(snapshot, snapshotName), { rate: ONE_STEP }); }
    finally { clearInterval(completionPulse); db.close(); }
    const snapshotDb = new DatabaseSync(join(snapshot, snapshotName));
    try { snapshotDb.exec("PRAGMA journal_mode = DELETE"); } finally { snapshotDb.close(); }
  }
}

/** An older backup's raw WAL goes into its database before the restore installs it, so the restored folder holds one
 * file per database as a new backup does. SQLite applies what of the log matches the database, as it would have on open. */
export function foldLegacySidecars(prepared: string): void {
  for (const name of Object.keys(SNAPSHOT_DATABASES)) {
    const wal = join(prepared, `${name}-wal`);
    const shm = join(prepared, `${name}-shm`);
    if (!LEGACY_SIDECARS.has(`${name}-wal`) || (!existsSync(wal) && !existsSync(shm))) continue;
    // The shared-memory index is the source server's; SQLite rebuilds it from the log.
    rmSync(shm, { force: true });
    if (existsSync(join(prepared, name)) && existsSync(wal)) {
      try {
        const db = new DatabaseSync(join(prepared, name));
        try { db.exec("PRAGMA journal_mode = DELETE"); } finally { db.close(); }
      } catch (error) {
        throw Object.assign(new Error("This backup's burst records (bursts.db) are damaged, so nothing was restored and nothing here changed. Make a new backup where it came from."), { cause: error });
      }
    }
    rmSync(wal, { force: true });
  }
}
