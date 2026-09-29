/** The engine sends an available expression as [operator, operand, operand]; shown infix. */
export function expressionText(parts: readonly string[]): string {
  if (parts.length === 3) return `${parts[1]} ${parts[0]} ${parts[2]}`;
  if (parts.length === 2) return `${parts[0]}${parts[1]}`;
  return parts.join(" ");
}
