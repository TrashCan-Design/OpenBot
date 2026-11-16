import { describe, expect, it } from "vitest";
import { addHeldSecretScrubber } from "../../redact.ts";
import { acpMissingSession, acpRpcError } from "./rpc-error.ts";

const cursor = "session-1";

describe("acpMissingSession", () => {
  it("matches OpenCode sessionId payload", () => {
    const error = acpRpcError({ code: -32602, data: { sessionId: cursor } }, "session/load");
    expect(acpMissingSession(error, cursor)).toBe(true);
    expect(acpMissingSession(error, "session-2")).toBe(false);
  });

  it("matches Cursor session not found message", () => {
    const error = acpRpcError({ code: -32602, message: `Invalid params: Session "${cursor}" not found` }, "session/load");
    expect(acpMissingSession(error, cursor)).toBe(true);
    expect(acpMissingSession(error, "session-2")).toBe(false);
  });

  it("matches the original message when redaction removes the session id from what is shown", () => {
    const remove = addHeldSecretScrubber((text) => text.split(cursor).join("«secret»"));
    try {
      const error = acpRpcError({ code: -32602, message: `Invalid params: Session "${cursor}" not found` }, "session/load");
      const shown = error as Error & { acpDiagnostic?: string };
      expect(shown.message.includes(cursor)).toBe(false);
      expect(shown.acpDiagnostic?.includes(cursor)).toBe(false);
      expect(acpMissingSession(error, cursor)).toBe(true);
    } finally {
      remove();
    }
  });

  it("compares the session id as written, and still accepts either case in the surrounding words", () => {
    const upper = cursor.toUpperCase();
    const error = acpRpcError({ code: -32602, message: `invalid params: SESSION "${upper}" NOT FOUND` }, "session/load");
    expect(acpMissingSession(error, upper)).toBe(true);
    expect(acpMissingSession(error, cursor)).toBe(false);
  });

  it("does not treat an earlier missing-session line quoted inside another error as this failure", () => {
    const error = acpRpcError({
      code: -32602,
      message: "Invalid params: model not found",
      data: { details: `Session "${cursor}" not found (session/load)` },
    }, "session/load");
    expect(acpMissingSession(error, cursor)).toBe(false);
  });
});
