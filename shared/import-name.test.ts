import { describe, expect, it } from "vitest";

import { takeImportName } from "./import-name.ts";

describe("takeImportName", () => {
  it("trims whitespace and takes the name", () => {
    const taken = new Set<string>();
    expect(takeImportName("  Scout  ", taken)).toBe("Scout");
    expect(taken.has("scout")).toBe(true);
  });

  it("increments numeric suffix case-insensitively when name is taken", () => {
    const taken = new Set<string>(["scout"]);
    expect(takeImportName("SCOUT", taken)).toBe("SCOUT 2");
    expect(takeImportName("Scout", taken)).toBe("Scout 3");
  });

  it("slices strings with surrogate pairs without splitting code points", () => {
    const taken = new Set<string>();
    const emojis = "🤖".repeat(10);
    expect(takeImportName(emojis, taken, 5)).toBe("🤖".repeat(5));

    // Boundary condition: surrogate pair at the slice edge
    const mixed = "abc🤖def";
    expect(takeImportName(mixed, taken, 4)).toBe("abc🤖");
    expect(takeImportName(mixed, taken, 3)).toBe("abc");
  });

  it("truncates base to fit suffix within maxLength", () => {
    const taken = new Set<string>(["a".repeat(10)]);
    expect(takeImportName("a".repeat(10), taken, 10)).toBe(`${"a".repeat(8)} 2`);
  });

  it("truncates surrogate pair base to fit suffix within maxLength", () => {
    const taken = new Set<string>(["🤖".repeat(10)]);
    expect(takeImportName("🤖".repeat(10), taken, 10)).toBe(`${"🤖".repeat(8)} 2`);
  });

  it("omits leading whitespace and fits within maxLength when maxLength < suffix.length", () => {
    const taken = new Set<string>(["a"]);
    expect(takeImportName("a", taken, 1)).toBe("2");
    expect(takeImportName("a", taken, 1)).toBe("3");

    const takenTwo = new Set<string>(["ab"]);
    expect(takeImportName("ab", takenTwo, 2)).toBe("2");
  });

  it("omits leading space when base string is empty", () => {
    const taken = new Set<string>([""]);
    expect(takeImportName("", taken, 10)).toBe("2");
    expect(takeImportName("   ", taken, 10)).toBe("3");
  });

  it("terminates when all single-character numeric slots are taken", () => {
    const taken = new Set<string>(["a", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(takeImportName("a", taken, 1)).toBe("10");
  });
});
