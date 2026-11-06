import { describe, expect, it, vi } from "vitest";

import type { HeadlessIo } from "./output.ts";
import { runHeadless } from "./main.ts";

type Rec = Record<string, any>;

function harness() {
  const calls: Array<{ name: string; args: Rec }> = [];
  const callTool = vi.fn(async (name: string, args: Rec) => {
    calls.push({ name, args });
    if (args.task_id === "missing") throw Object.assign(new Error("no such task missing"), { status: 404 });
    if (args.task_id === "other-bot") throw Object.assign(new Error("that conversation belongs to another bot"), { status: 403 });
    if (name === "create_task") return { success: true, task: { taskId: "fresh" } };
    if (name === "send_channel_message") return { success: true, channelId: args.channel_id, taskId: args.task_id ?? "r-active", messageId: "m1" };
    if (name === "send_bot_message") return { success: true, botId: args.bot_id, taskId: args.task_id ?? "b-active", messageId: "m1" };
    throw new Error(`unexpected tool ${name}`);
  });
  const request = vi.fn(async (path: string) => {
    if (path === "/api/bots?messages=0") {
      return { bots: [{ id: "lead", name: "Room Lead", threadId: "b-active", tasks: [{ threadId: "b-active" }, { threadId: "b-old" }] }],
        groups: [{ id: "room", name: "Launch Room", threadId: "r-active", tasks: [{ threadId: "r-active" }, { threadId: "r-old" }] }] };
    }
    throw new Error(`unexpected path ${path}`);
  });
  const out: string[] = [];
  const err: string[] = [];
  const io: HeadlessIo = { out: (text) => out.push(text), err: (text) => err.push(text), readStdin: async () => "" };
  const run = async (argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await runHeadless(argv, { env: { OPENMAUSBOT_URL: "http://127.0.0.1:19999" }, io, callTool: callTool as any, request: request as any });
    return { code, out: [...out], err: [...err] };
  };
  return { calls, run };
}

describe("send", () => {
  it("starts a new conversation in a room with --task new, titled by the message's first line, and names it", async () => {
    const h = harness();
    const { code, out } = await h.run(["send", "Launch Room", "Plan the launch\nwith everyone", "--task", "new"]);
    expect(code).toBe(0);
    expect(h.calls.map((call) => call.name)).toEqual(["create_task", "send_channel_message"]);
    expect(h.calls[0]!.args).toEqual({ target_type: "channel", target_id: "room", title: "Plan the launch" });
    expect(h.calls[1]!.args).toEqual({ channel_id: "room", task_id: "fresh", text: "Plan the launch\nwith everyone", send_id: expect.stringMatching(/^cli-/) });
    expect(out[0]).toBe('Sent to Launch Room in a new conversation, "Plan the launch", (thread fresh).');
  });

  it("starts a new conversation for a bot and takes --title, reporting it in --json", async () => {
    const h = harness();
    const { code, out } = await h.run(["send", "--bot", "lead", "hello", "--task", "new", "--title", "Daily check", "--json"]);
    expect(code).toBe(0);
    expect(h.calls[0]!.args).toEqual({ target_type: "bot", target_id: "lead", title: "Daily check" });
    expect(JSON.parse(out[0]!)).toMatchObject({ taskId: "fresh", newConversation: { title: "Daily check" } });
  });

  it("goes to the open conversation by default and with --task current, and to the one --task ID names", async () => {
    const h = harness();
    await h.run(["send", "Launch Room", "hello"]);
    await h.run(["send", "Launch Room", "hello", "--task", "current"]);
    await h.run(["send", "Room Lead", "hello", "--task", "b-old"]);
    expect(h.calls.map((call) => [call.name, call.args.task_id])).toEqual([
      ["send_channel_message", undefined], ["send_channel_message", "r-active"], ["send_bot_message", "b-old"]]);
  });

  it("keeps a caller's --send-id on a retry and does not open another conversation", async () => {
    const h = harness();
    await h.run(["send", "--bot", "lead", "hello", "--send-id", "cli-retry-same"]);
    await h.run(["send", "--bot", "lead", "hello", "--send-id", "cli-retry-same"]);
    expect(h.calls.map((call) => call.name)).toEqual(["send_bot_message", "send_bot_message"]);
    expect(h.calls.every((call) => call.args.send_id === "cli-retry-same")).toBe(true);
  });

  it("reports an unknown conversation and a conversation the session cannot use, without creating one", async () => {
    const h = harness();
    const missing = await h.run(["send", "--bot", "lead", "hello", "--task", "missing", "--json"]);
    expect(missing.code).toBe(2);
    expect(JSON.parse(missing.out[0]!)).toMatchObject({ ok: false, exitCode: 2, error: expect.stringMatching(/no such task/) });
    const refused = await h.run(["send-channel", "--channel", "room", "hello", "--task", "other-bot", "--json"]);
    expect(refused.code).toBe(5);
    expect(JSON.parse(refused.out[0]!)).toMatchObject({ ok: false, exitCode: 5, error: expect.stringMatching(/not allowed/) });
    expect(h.calls.map((call) => call.name)).toEqual(["send_bot_message", "send_channel_message"]);
  });

  it("starts nothing on --dry-run, and refuses --title without --task new", async () => {
    const h = harness();
    const preview = await h.run(["send", "Launch Room", "hello", "--task", "new", "--dry-run", "--json"]);
    expect(preview.code).toBe(0);
    expect(JSON.parse(preview.out[0]!)).toMatchObject({ dryRun: true, tool: "send_channel_message", newConversation: { title: "hello" } });
    expect(h.calls).toEqual([]);
    expect((await h.run(["send", "Launch Room", "hello", "--title", "T"])).code).toBe(2);
    expect(h.calls).toEqual([]);
  });
});
