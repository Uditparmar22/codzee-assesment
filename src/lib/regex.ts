/** Escapes RegExp metacharacters so user input is matched literally. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
