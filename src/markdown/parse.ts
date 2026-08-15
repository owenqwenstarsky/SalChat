import { consumeAutolink, isSafeHttpUrl } from './links';
import type { Block, Inline, ListItem, ListMarker, TableAlign } from './types';

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const fence = readFenceOpener(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      let closed = false;
      while (index < lines.length) {
        if (isFenceCloser(lines[index] ?? '', fence.length)) {
          closed = true;
          index += 1;
          break;
        }
        body.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', language: fence.language, text: body.join('\n'), closed });
      continue;
    }

    if (isRule(line)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    const heading = readHeading(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading.level, inlines: parseInlines(heading.text) });
      index += 1;
      continue;
    }

    if (isQuote(line)) {
      const quoted: string[] = [];
      while (index < lines.length && isQuote(lines[index] ?? '')) {
        quoted.push(stripQuote(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ type: 'quote', inlines: parseInlines(quoted.join('\n')) });
      continue;
    }

    if (readListMarker(line)) {
      const parsed = readList(lines, index);
      blocks.push({ type: 'list', items: parsed.items });
      index = parsed.next;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = readTable(lines, index);
      blocks.push(parsed.table);
      index = parsed.next;
      continue;
    }

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isBlockBoundary(lines, index)) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    const joined = joinParagraph(paragraph);
    if (joined) blocks.push({ type: 'paragraph', inlines: parseInlines(joined) });
  }

  return blocks;
}

export function parseInlines(source: string): Inline[] {
  const nodes: Inline[] = [];
  let index = 0;
  let textStart = 0;

  const flush = (end = index) => {
    if (end > textStart) nodes.push({ type: 'text', value: source.slice(textStart, end) });
  };

  while (index < source.length) {
    const char = source[index] ?? '';

    if (char === '\\' && index + 1 < source.length && PUNCTUATION.test(source[index + 1] ?? '')) {
      flush();
      nodes.push({ type: 'text', value: source[index + 1] ?? '' });
      index += 2;
      textStart = index;
      continue;
    }

    if (char === '`') {
      const ticks = countRun(source, index, '`');
      const close = findBacktickClose(source, index + ticks, ticks);
      if (close !== -1) {
        flush();
        nodes.push({ type: 'code', value: source.slice(index + ticks, close) });
        index = close + ticks;
        textStart = index;
        continue;
      }
    }

    if (char === '[') {
      const link = readMarkdownLink(source, index);
      if (link) {
        flush();
        if (isSafeHttpUrl(link.href)) {
          nodes.push({ type: 'link', href: link.href, children: parseInlines(link.label) });
        } else {
          nodes.push(...parseInlines(link.label));
        }
        index = link.end;
        textStart = index;
        continue;
      }
    }

    const autolink = consumeAutolink(source, index);
    if (autolink) {
      flush();
      nodes.push({ type: 'link', href: autolink, children: [{ type: 'text', value: autolink }] });
      index += autolink.length;
      textStart = index;
      continue;
    }

    if (source.startsWith('~~', index)) {
      const close = findDelimiter(source, index + 2, '~~');
      if (close > index + 2) {
        flush();
        nodes.push({ type: 'strike', children: parseInlines(source.slice(index + 2, close)) });
        index = close + 2;
        textStart = index;
        continue;
      }
    }

    if (source.startsWith('***', index)) {
      const close = findDelimiter(source, index + 3, '***');
      if (close > index + 3) {
        flush();
        nodes.push({
          type: 'strong',
          children: [{ type: 'em', children: parseInlines(source.slice(index + 3, close)) }],
        });
        index = close + 3;
        textStart = index;
        continue;
      }
    }

    if (source.startsWith('**', index)) {
      const close = findDelimiter(source, index + 2, '**');
      if (close > index + 2) {
        flush();
        nodes.push({ type: 'strong', children: parseInlines(source.slice(index + 2, close)) });
        index = close + 2;
        textStart = index;
        continue;
      }
    }

    if (char === '*') {
      const close = findDelimiter(source, index + 1, '*');
      if (close > index + 1) {
        flush();
        nodes.push({ type: 'em', children: parseInlines(source.slice(index + 1, close)) });
        index = close + 1;
        textStart = index;
        continue;
      }
    }

    index += 1;
  }

  flush(source.length);
  return mergeAdjacentText(nodes);
}

function readFenceOpener(line: string): { length: number; language: string } | null {
  const trimmed = line.trimStart();
  if (line.length - trimmed.length > 3) return null;
  if (!trimmed.startsWith('```')) return null;
  const length = countRun(trimmed, 0, '`');
  if (length < 3) return null;
  const language = trimmed.slice(length).trim().slice(0, 40);
  if (language.includes('`')) return null;
  return { length, language };
}

function isFenceCloser(line: string, openLength: number): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('`')) return false;
  const length = countRun(trimmed, 0, '`');
  return length >= openLength && trimmed.slice(length).trim() === '';
}

function isRule(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 3 && /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed);
}

function readHeading(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | null {
  let level = 0;
  while (level < line.length && level < 6 && line[level] === '#') level += 1;
  if (level === 0 || line[level] !== ' ') return null;
  return { level: level as 1 | 2 | 3 | 4 | 5 | 6, text: line.slice(level + 1).trimEnd() };
}

function isQuote(line: string): boolean {
  return /^\s{0,3}>/.test(line);
}

function stripQuote(line: string): string {
  return line.replace(/^\s{0,3}>\s?/, '');
}

function readListMarker(line: string): { indent: number; marker: ListMarker; content: string; family: 'bullet' | 'ordered' } | null {
  const indent = visualIndent(line);
  const restOfLine = line.replace(/^[\t ]*/, '');
  const match = /^([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(restOfLine);
  if (!match) return null;
  const token = match[1] ?? '';
  const rest = match[2] ?? '';
  if (/^\d/.test(token)) {
    return {
      indent,
      family: 'ordered',
      marker: { type: 'ordered', number: Number.parseInt(token, 10) },
      content: rest,
    };
  }
  const task = /^\[([ xX])\](?:\s+|$)(.*)$/.exec(rest);
  if (task) {
    return {
      indent,
      family: 'bullet',
      marker: { type: 'task', checked: task[1] !== ' ' },
      content: task[2] ?? '',
    };
  }
  return { indent, family: 'bullet', marker: { type: 'bullet' }, content: rest };
}

function readList(lines: string[], start: number): { items: ListItem[]; next: number } {
  const first = readListMarker(lines[start] ?? '');
  if (!first) return { items: [], next: start };
  const items: ListItem[] = [];
  let index = start;

  while (index < lines.length) {
    const parsed = readListMarker(lines[index] ?? '');
    if (!parsed) break;
    if (parsed.indent < first.indent) break;
    if (parsed.indent <= first.indent && parsed.family !== first.family) break;

    const item: ListItem = { marker: parsed.marker, inlines: parseInlines(parsed.content), children: [] };
    if (parsed.indent >= first.indent + 2 && items.length) {
      items[items.length - 1]!.children.push(item);
    } else {
      items.push(item);
    }
    index += 1;
  }

  return { items, next: index };
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? '';
  const separator = lines[index + 1];
  if (separator === undefined) return false;
  return header.includes('|') && isTableSeparator(separator);
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  if (!cells.length) return false;
  return cells.every((cell) => {
    const trimmed = cell.trim();
    return /^:?-{1,}:?$/.test(trimmed) && trimmed.includes('-');
  });
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (!trimmed.includes('|')) return [];
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function readAlign(cell: string): TableAlign {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function readTable(lines: string[], start: number): { table: Extract<Block, { type: 'table' }>; next: number } {
  const headerCells = splitTableRow(lines[start] ?? '');
  const align = splitTableRow(lines[start + 1] ?? '').map(readAlign);
  const rows: Inline[][][] = [];
  let index = start + 2;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.includes('|') || line.trim() === '' || readFenceOpener(line) || isRule(line) || readHeading(line)) break;
    rows.push(splitTableRow(line).map((cell) => parseInlines(cell)));
    index += 1;
  }
  return {
    table: {
      type: 'table',
      align,
      header: headerCells.map((cell) => parseInlines(cell)),
      rows,
    },
    next: index,
  };
}

function isBlockBoundary(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (line.trim() === '') return true;
  if (readFenceOpener(line) || isRule(line) || readHeading(line) || isQuote(line)) return true;
  if (readListMarker(line) && visualIndent(line) < 2) return true;
  if (isTableStart(lines, index)) return true;
  return false;
}

function joinParagraph(lines: string[]): string {
  return lines
    .map((line, index) => {
      if (index === lines.length - 1) return line.replace(/[ \t]+$/, '');
      if (line.endsWith('  ')) return `${line.slice(0, -2)}\n`;
      return `${line.replace(/[ \t]+$/, '')} `;
    })
    .join('')
    .replace(/[ \t]+$/g, '');
}

function visualIndent(line: string): number {
  let indent = 0;
  for (const char of line) {
    if (char === ' ') indent += 1;
    else if (char === '\t') indent += 4;
    else break;
  }
  return indent;
}

function readMarkdownLink(source: string, start: number): { label: string; href: string; end: number } | null {
  if (source[start] !== '[') return null;
  let depth = 1;
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\' && index + 1 < source.length) {
      index += 2;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    index += 1;
  }
  if (depth !== 0 || source[index] !== ']') return null;
  const label = source.slice(start + 1, index);
  if (source[index + 1] !== '(') return null;

  let cursor = index + 2;
  while (source[cursor] === ' ') cursor += 1;

  if (source[cursor] === '<') {
    const close = source.indexOf('>', cursor + 1);
    if (close === -1) return null;
    let end = close + 1;
    while (source[end] === ' ') end += 1;
    if (source[end] !== ')') return null;
    return { label, href: source.slice(cursor + 1, close).trim(), end: end + 1 };
  }

  let paren = 0;
  let hrefEnd = cursor;
  while (hrefEnd < source.length) {
    const char = source[hrefEnd];
    if (char === '(') paren += 1;
    else if (char === ')') {
      if (paren === 0) break;
      paren -= 1;
    } else if (char === ' ' || char === '\n') break;
    hrefEnd += 1;
  }
  if (source[hrefEnd] !== ')') return null;
  return { label, href: source.slice(cursor, hrefEnd), end: hrefEnd + 1 };
}

function findBacktickClose(source: string, from: number, ticks: number): number {
  let index = from;
  while (index < source.length) {
    if (source[index] !== '`') {
      index += 1;
      continue;
    }
    const run = countRun(source, index, '`');
    if (run === ticks) return index;
    index += run;
  }
  return -1;
}

function findDelimiter(source: string, from: number, delimiter: string): number {
  let index = from;
  while (index <= source.length - delimiter.length) {
    if (source[index] === '\\' && index + 1 < source.length) {
      index += 2;
      continue;
    }
    if (source[index] === '`') {
      const ticks = countRun(source, index, '`');
      const close = findBacktickClose(source, index + ticks, ticks);
      if (close !== -1) {
        index = close + ticks;
        continue;
      }
    }
    if (source.startsWith(delimiter, index)) return index;
    index += 1;
  }
  return -1;
}

function countRun(source: string, start: number, char: string): number {
  let count = 0;
  while (source[start + count] === char) count += 1;
  return count;
}

function mergeAdjacentText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const node of nodes) {
    const last = merged.at(-1);
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', value: last.value + node.value };
    } else {
      merged.push(node);
    }
  }
  return merged;
}
