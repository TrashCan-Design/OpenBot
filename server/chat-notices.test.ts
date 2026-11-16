import { describe, expect, it } from "vitest";
import { failedTurnCause } from "../shared/failed-turn.ts";
import { chatNotice, failedNoticeTool } from "./chat-notices.ts";

describe("chat notices", () => {
  it("formats stalled notice", () => {
    const text = chatNotice("chat.notice.stalled", { minutes: 20 });
    expect(text).toBe("no activity for 20 minutes — the turn was stopped");
  });

  it("scrubs a secret from a failed turn's cause and its params", () => {
    const token = "sk-ant-api03-" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
    const tool = failedNoticeTool("chat.notice.stalledCommand", { command: `curl -H "Authorization: Bearer ${token}" https://example.com`, minutes: 120 });
    expect(tool.nameCode).toBe("chat.notice.stalledCommand");
    expect(tool.name).toContain("curl -H");
    expect(JSON.stringify(tool)).not.toContain(token);
    expect(failedTurnCause(tool.name)).not.toContain(token);
  });
});
