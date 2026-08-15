const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"']);

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Consume a bare URL starting at `start`. Strips unmatched trailing punctuation. */
export function consumeAutolink(source: string, start: number): string | null {
  if (!source.startsWith('https://', start) && !source.startsWith('http://', start)) return null;
  let end = start;
  while (end < source.length && isUrlChar(source[end]!)) end += 1;
  let href = source.slice(start, end);
  href = trimTrailingUrlPunctuation(href);
  return href.length > 8 && isSafeHttpUrl(href) ? href : null;
}

function isUrlChar(char: string): boolean {
  const code = char.charCodeAt(0);
  if (char === ' ' || char === '\n' || char === '\t' || char === '<' || char === '"' || char === "'" || char === '`') return false;
  return code > 32 && code < 127;
}

function trimTrailingUrlPunctuation(href: string): string {
  let result = href;
  while (result.length > 0) {
    const last = result[result.length - 1]!;
    if (last === ')') {
      const opens = countChar(result, '(');
      const closes = countChar(result, ')');
      if (closes > opens) {
        result = result.slice(0, -1);
        continue;
      }
    }
    if (TRAILING_PUNCTUATION.has(last)) {
      result = result.slice(0, -1);
      continue;
    }
    break;
  }
  return result;
}

function countChar(value: string, char: string): number {
  let count = 0;
  for (const next of value) if (next === char) count += 1;
  return count;
}
