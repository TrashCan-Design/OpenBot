import { describe, expect, it } from "vitest";
import { isFormattedReply, splitReplyBlocks } from "./formatted-reply";

describe("isFormattedReply", () => {
  it.each([
    ["a bullet list", "Three things:\n- Acme\n- Priya"],
    ["a numbered list", "1. Acme wants the invoice"],
    ["a heading", "## By sender\nAcme wrote twice."],
    ["a code fence", "The filter:\n```js\nmail.filter(Boolean)\n```"],
    ["a four-backtick code fence", "````js\nmail.filter(Boolean)\n````"],
    ["a tilde fence with backticks in its info string", "~~~ foo ` bar\nhello\n~~~"],
    ["a quote", "> I archived 31 newsletters."],
    ["a table", "| Sender | Emails |\n| --- | ---: |\n| Acme | 4 |"],
  ])("treats %s as formatted", (_label, text) => {
    expect(isFormattedReply(text)).toBe(true);
  });

  it.each([
    ["a chat line", "Done. I will look every morning at 8."],
    ["two paragraphs", "Done.\n\nI will write here when something needs you."],
    ["a dash inside a sentence", "Acme - the invoice - is due Friday."],
    ["a pipe inside a sentence", "Pick red | blue"],
    ["a hashtag", "#launch went well"],
    ["a number that starts a line", "2024 was a good year."],
    ["a backtick fence with backticks in its info string", "``` foo ` bar"],
    ["a four-backtick fence with backticks in its info string", "```` foo ` bar"],
  ])("keeps %s as a chat line", (_label, text) => {
    expect(isFormattedReply(text)).toBe(false);
  });
});

describe("splitReplyBlocks", () => {
  const table = "| Sender | Emails |\n|---|---:|\n| Acme | 4 |\n| Priya | 2 |";

  it("keeps a reply with no table as one prose block", () => {
    expect(splitReplyBlocks("Hello\n\n- one\n- two")).toEqual([{ kind: "prose", text: "Hello\n\n- one\n- two" }]);
  });

  it("lifts each table out between the prose around it, with the heading above it kept in the prose", () => {
    const text = `Here is the summary.\n\n## By sender\n${table}\n\nWant me to reply?`;
    expect(splitReplyBlocks(text)).toEqual([
      { kind: "prose", text: "Here is the summary.\n\n## By sender" },
      { kind: "table", text: table },
      { kind: "prose", text: "Want me to reply?" },
    ]);
  });

  it("returns a reply that is only a table as one table block, and splits two tables apart", () => {
    expect(splitReplyBlocks(table)).toEqual([{ kind: "table", text: table }]);
    expect(splitReplyBlocks(`${table}\n\n${table}`).map((block) => block.kind)).toEqual(["table", "table"]);
  });

  it("never counts pipes inside a code fence, and needs a delimiter row under the first line", () => {
    const fenced = "```md\n| a | b |\n|---|---|\n```";
    expect(splitReplyBlocks(fenced)).toEqual([{ kind: "prose", text: fenced }]);
    const multiFence = "````markdown\n```\n| a | b |\n|---|---|\n```\n````";
    expect(splitReplyBlocks(multiFence)).toEqual([{ kind: "prose", text: multiFence }]);
    expect(splitReplyBlocks("| just | pipes |\nno delimiter")).toEqual([{ kind: "prose", text: "| just | pipes |\nno delimiter" }]);
  });

  it("does not enter code fence mode when backtick fence has backticks in info string", () => {
    const invalidFence = "``` foo ` bar\n" + table + "\n```";
    expect(splitReplyBlocks(invalidFence)).toEqual([
      { kind: "prose", text: "``` foo ` bar" },
      { kind: "table", text: table },
      { kind: "prose", text: "```" },
    ]);
    const validTildeFence = "~~~ foo ` bar\n" + table + "\n~~~";
    expect(splitReplyBlocks(validTildeFence)).toEqual([{ kind: "prose", text: validTildeFence }]);

    const indentedInvalidFence = "   ``` info`extra\n" + table + "\n```";
    expect(splitReplyBlocks(indentedInvalidFence)).toEqual([
      { kind: "prose", text: "   ``` info`extra" },
      { kind: "table", text: table },
      { kind: "prose", text: "```" },
    ]);

    const insideValidFence = "```\n``` foo ` bar\n" + table + "\n```";
    expect(splitReplyBlocks(insideValidFence)).toEqual([{ kind: "prose", text: insideValidFence }]);
  });
});
