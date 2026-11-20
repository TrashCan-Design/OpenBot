import { describe, expect, it } from "vitest";

import { importedMcpServerName, RESERVED_MCP_NAMES, slugMcpName } from "./mcp-name.ts";

describe("slugMcpName", () => {
  it("normalizes to lowercase and replaces non-alphanumeric with hyphen", () => {
    expect(slugMcpName("My Server Name")).toBe("my-server-name");
    expect(slugMcpName("my_server")).toBe("my_server");
  });

  it("strips leading hyphens and trailing hyphens", () => {
    expect(slugMcpName("---test---")).toBe("test");
  });

  it("strips trailing hyphens after slicing slug at 32 characters", () => {
    const raw = `${"a".repeat(31)}-extra`;
    expect(slugMcpName(raw)).toBe("a".repeat(31));
  });

  it("prefixes with mcp- if not starting with a letter", () => {
    expect(slugMcpName("123-server")).toBe("mcp-123-server");
    expect(slugMcpName("_private")).toBe("mcp-_private");
  });

  it("strips trailing hyphens when mcp- prefix is sliced at 32 characters", () => {
    const raw = `${"1".repeat(27)}-extra`;
    // "mcp-" + 27 '1's = 31 chars; if 32nd char was hyphen, it gets stripped
    expect(slugMcpName(raw)).toBe(`mcp-${"1".repeat(27)}`);
  });

  it("returns empty string for empty or symbol-only input", () => {
    expect(slugMcpName("")).toBe("");
    expect(slugMcpName("   ")).toBe("");
    expect(slugMcpName("---")).toBe("");
    expect(slugMcpName("$$$")).toBe("");
  });
});

describe("importedMcpServerName", () => {
  it("prefixes reserved names with mcp-", () => {
    for (const name of RESERVED_MCP_NAMES) {
      expect(importedMcpServerName(name)).toBe(`mcp-${name}`.slice(0, 32));
    }
  });

  it("leaves unreserved names alone", () => {
    expect(importedMcpServerName("custom-server")).toBe("custom-server");
  });
});
