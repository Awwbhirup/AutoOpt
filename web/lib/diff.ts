/**
 * A line diff by longest common subsequence. Listings here are tens of lines,
 * so the quadratic table is cheap, and LCS gives the diff a person expects:
 * unchanged lines kept, the rest shown as removed then added.
 */

export type DiffLine =
  | { kind: "same"; text: string; before: number; after: number }
  | { kind: "del"; text: string; before: number }
  | { kind: "add"; text: string; after: number };

export function diffLines(before: readonly string[], after: readonly string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  // lcs[i][j]: length of the LCS of before[i:] and after[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: "same", text: before[i], before: i + 1, after: j + 1 });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "del", text: before[i], before: i + 1 });
      i += 1;
    } else {
      out.push({ kind: "add", text: after[j], after: j + 1 });
      j += 1;
    }
  }
  for (; i < n; i += 1) out.push({ kind: "del", text: before[i], before: i + 1 });
  for (; j < m; j += 1) out.push({ kind: "add", text: after[j], after: j + 1 });
  return out;
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.kind === "add").length,
    removed: lines.filter((line) => line.kind === "del").length,
  };
}
