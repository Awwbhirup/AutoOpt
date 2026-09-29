/** Joins class names, dropping the falsy ones a condition left behind. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
