import { describe, expect, it } from "vitest";

import { expressionText } from "./facts";

describe("expressionText", () => {
  it("prints binary expressions infix and unary ones prefixed", () => {
    expect(expressionText(["<", "i", "n"])).toBe("i < n");
    expect(expressionText(["-", "x"])).toBe("-x");
    expect(expressionText(["x"])).toBe("x");
  });
});
