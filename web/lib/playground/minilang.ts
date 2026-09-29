/**
 * MiniLang for CodeMirror: a stream tokenizer over the same lexical rules the
 * engine's lexer uses (keywords, numbers, identifiers, both comment forms).
 * Highlighting only; the engine is what decides whether a program is valid.
 */

import type { StreamParser, StringStream } from "@codemirror/language";

export const MINILANG_KEYWORDS = new Set(["int", "input", "if", "else", "while", "for", "print"]);

interface State {
  inBlockComment: boolean;
}

function token(stream: StringStream, state: State): string | null {
  if (state.inBlockComment) {
    if (stream.skipTo("*/")) {
      stream.match("*/");
      state.inBlockComment = false;
    } else {
      stream.skipToEnd();
    }
    return "comment";
  }
  if (stream.eatSpace()) return null;
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("/*")) {
    state.inBlockComment = true;
    return token(stream, state) ?? "comment";
  }
  if (stream.match(/^\d+/)) return "number";
  const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/) as RegExpMatchArray | null;
  if (word) return MINILANG_KEYWORDS.has(word[0]) ? "keyword" : "variableName";
  if (stream.match(/^(==|!=|<=|>=|&&|\|\||[+\-*/%<>=!])/)) return "operator";
  if (stream.match(/^[(){};]/)) return "punctuation";
  stream.next();
  return "invalid";
}

export const minilang: StreamParser<State> = {
  name: "minilang",
  startState: () => ({ inBlockComment: false }),
  copyState: (state) => ({ ...state }),
  token,
  languageData: { commentTokens: { line: "//", block: { open: "/*", close: "*/" } } },
};
