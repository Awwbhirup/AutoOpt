"use client";

/**
 * The MiniLang editor: CodeMirror 6 with the MiniLang tokenizer, a highlight
 * style drawn from the app tokens, and the engine's parse error shown inline.
 *
 * The view is created once and fed changes through effects, so typing never
 * remounts it and the cursor stays put.
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

import { minilang } from "@/lib/playground/minilang";

export interface EditorDiagnostic {
  line: number;
  column: number;
  message: string;
}

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--ramp-1)", fontWeight: "600" },
  { tag: tags.number, color: "var(--ramp-3)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.operator, color: "color-mix(in srgb, var(--foreground) 65%, transparent)" },
  { tag: tags.variableName, color: "var(--foreground)" },
  { tag: tags.punctuation, color: "var(--muted)" },
  { tag: tags.invalid, color: "var(--refused)", textDecoration: "underline wavy" },
]);

const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--foreground)", fontSize: "13px", height: "100%" },
  ".cm-scroller": { fontFamily: "var(--font-terminal), ui-monospace, monospace", lineHeight: "1.65" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--ramp-2)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--muted)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ramp-2) 28%, transparent) !important",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--ramp-2)", borderLeftWidth: "2px" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--refused)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
    borderRadius: "8px",
  },
});

export function MiniLangEditor({
  value,
  onChange,
  diagnostic,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  diagnostic: EditorDiagnostic | null;
  label: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (host.current === null) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          StreamLanguage.define(minilang),
          syntaxHighlighting(highlight),
          lintGutter(),
          theme,
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
    // Created once; later values arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value set from outside (a sample, a shared link) replaces the document.
  useEffect(() => {
    const current = view.current;
    if (current === null || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    const doc = current.state.doc;
    const diagnostics =
      diagnostic === null || diagnostic.line > doc.lines
        ? []
        : (() => {
            const line = doc.line(diagnostic.line);
            const from = Math.min(line.from + Math.max(diagnostic.column - 1, 0), line.to);
            return [{ from, to: Math.min(from + 1, line.to) || from, severity: "error" as const, message: diagnostic.message }];
          })();
    current.dispatch(setDiagnostics(current.state, diagnostics));
  }, [diagnostic]);

  return <div ref={host} className="h-full min-h-[22rem] overflow-hidden" data-lenis-prevent />;
}
