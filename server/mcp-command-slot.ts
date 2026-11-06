// One command MCP process for a spec. A restart swaps it only after the process we started is confirmed stopped,
// and a call already in flight is not run again.
import type { ChildProcess } from "node:child_process";

import type { StdioMcpSpec } from "./contracts.ts";
import { killCliTree, spawnCli } from "./procs.ts";

const specKey = (spec: StdioMcpSpec) => JSON.stringify([spec.command, spec.args, spec.env]);

export class CommandSlot {
  private child: ChildProcess | null = null;
  private key = "";
  private calls = 0;
  private pending: StdioMcpSpec | null = null;
  private replacing: Promise<void> | null = null;

  pid(): number | undefined {
    return this.child?.pid;
  }

  async stop(): Promise<void> {
    const old = this.child;
    this.child = null;
    this.key = "";
    if (old) {
      const stopped = await killCliTree(old, 1_000);
      if (!stopped) throw new Error("could not confirm the old MCP process stopped");
    }
  }

  start(spec: StdioMcpSpec): number {
    if (this.child) throw new Error("a command process is already running");
    return this.spawn(spec);
  }

  beginCall(): void {
    this.calls += 1;
  }

  async endCall(): Promise<void> {
    this.calls = Math.max(0, this.calls - 1);
    if (this.calls === 0 && this.pending) {
      const next = this.pending;
      this.pending = null;
      await this.replaceNow(next);
    }
  }

  /** Same spec keeps the process. A different spec replaces it, or waits out the call in flight. */
  async replace(spec: StdioMcpSpec): Promise<"kept" | "replaced" | "deferred"> {
    if (this.child && specKey(spec) === this.key) return "kept";
    if (this.calls > 0) {
      this.pending = spec;
      return "deferred";
    }
    await this.replaceNow(spec);
    return "replaced";
  }

  private async replaceNow(spec: StdioMcpSpec): Promise<void> {
    if (this.replacing) return this.replacing;
    const run = (async () => {
      const old = this.child;
      this.child = null;
      this.key = "";
      if (old) {
        const stopped = await killCliTree(old, 1_000);
        if (!stopped) throw new Error("could not confirm the old MCP process stopped");
      }
      this.spawn(spec);
    })();
    this.replacing = run;
    try {
      await run;
    } finally {
      if (this.replacing === run) this.replacing = null;
    }
  }

  private spawn(spec: StdioMcpSpec): number {
    const child = spawnCli(spec.command, spec.args, { stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, ...spec.env } }, "openmausbot");
    this.child = child;
    this.key = specKey(spec);
    const pid = child.pid;
    if (!pid) throw new Error("the command process did not start");
    return pid;
  }
}
