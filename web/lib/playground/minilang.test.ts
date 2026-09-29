import { StringStream } from "@codemirror/language";
import { describe, expect, it } from "vitest";

import { minilang } from "./minilang";

function tokens(lines: string[]): string[] {
  const state = minilang.startState!(2);
  const out: string[] = [];
  for (const line of lines) {
    const stream = new StringStream(line, 2, 2);
    while (!stream.eol()) {
      const style = minilang.token(stream, state);
      const text = stream.current();
      if (style) out.push(`${style}:${text}`);
      stream.start = stream.pos;
    }
  }
  return out;
}

describe("minilang tokenizer", () => {
  it("tells keywords, names, numbers and operators apart", () => {
    expect(tokens(["int a = 2 + x;"])).toEqual([
      "keyword:int",
      "variableName:a",
      "operator:=",
      "number:2",
      "operator:+",
      "variableName:x",
      "punctuation:;",
    ]);
  });

  it("matches two character operators before their prefixes", () => {
    expect(tokens(["a <= b && c != d"]).filter((t) => t.startsWith("operator"))).toEqual([
      "operator:<=",
      "operator:&&",
      "operator:!=",
    ]);
  });

  it("carries a block comment across lines", () => {
    expect(tokens(["x /* start", "still */ print"])).toEqual([
      "variableName:x",
      "comment:/* start",
      "comment:still */",
      "keyword:print",
    ]);
    expect(tokens(["// all of it"])).toEqual(["comment:// all of it"]);
  });
});
