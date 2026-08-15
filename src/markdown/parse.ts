import MarkdownIt from 'markdown-it';
import { tex } from '@mdit/plugin-tex';
import { isSafeHttpUrl } from './links';
import type { Block, Inline, ListItem, ListMarker, TableAlign } from './types';

const PROTECTED_SLASH = '\uE000';
const PROTECTED_DOLLAR = '\uE001';

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});

// Parsing unsafe destinations lets the adapter retain the label while dropping
// the destination. Nothing from markdown-it is rendered as HTML.
markdown.validateLink = () => true;
markdown.use(tex, {
  delimiters: 'all',
  render: () => '',
});

type Token = ReturnType<(typeof markdown)['parse']>[number];

export function parseMarkdown(source: string): Block[] {
  const protectedSource = protectIncompleteMath(source);
  const tokens = markdown.parse(protectedSource, {});
  return new BlockReader(tokens, source).read();
}

export function parseInlines(source: string): Inline[] {
  const protectedSource = protectIncompleteMath(source);
  const container = markdown.parseInline(protectedSource, {})[0];
  return convertInlineTokens(container?.children ?? [], 'space');
}

class BlockReader {
  private cursor = 0;
  private readonly lines: string[];

  constructor(
    private readonly tokens: Token[],
    source: string,
  ) {
    this.lines = source.split(/\r?\n/);
  }

  read(stopType?: string, softbreak: 'space' | 'newline' = 'space'): Block[] {
    const blocks: Block[] = [];

    while (this.cursor < this.tokens.length && this.tokens[this.cursor]?.type !== stopType) {
      const token = this.tokens[this.cursor]!;

      if (token.type === 'paragraph_open') {
        blocks.push({ type: 'paragraph', inlines: this.readInlineBlock('paragraph_close', softbreak) });
        continue;
      }

      if (token.type === 'heading_open') {
        const level = Number.parseInt(token.tag.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
        blocks.push({ type: 'heading', level, inlines: this.readInlineBlock('heading_close', softbreak) });
        continue;
      }

      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        blocks.push(this.readList());
        continue;
      }

      if (token.type === 'blockquote_open') {
        this.cursor += 1;
        const quoted = this.read('blockquote_close', 'newline');
        if (this.tokens[this.cursor]?.type === 'blockquote_close') this.cursor += 1;
        blocks.push({ type: 'quote', inlines: flattenBlocks(quoted) });
        continue;
      }

      if (token.type === 'fence' || token.type === 'code_block') {
        blocks.push({
          type: 'code',
          language: token.info.trim().split(/\s+/)[0]?.slice(0, 40) ?? '',
          text: token.content.replace(/\n$/, ''),
          closed: token.type === 'code_block' || this.isFenceClosed(token),
        });
        this.cursor += 1;
        continue;
      }

      if (token.type === 'math_block') {
        const value = normalizeMath(token.content).trim();
        blocks.push({
          type: 'math',
          value,
          raw: this.rawLines(token) || wrapMath(value, token.markup, true),
        });
        this.cursor += 1;
        continue;
      }

      if (token.type === 'table_open') {
        blocks.push(this.readTable());
        continue;
      }

      if (token.type === 'hr') {
        blocks.push({ type: 'rule' });
        this.cursor += 1;
        continue;
      }

      if (token.type === 'html_block') {
        blocks.push({ type: 'paragraph', inlines: [{ type: 'text', value: restoreProtected(token.content.trimEnd()) }] });
        this.cursor += 1;
        continue;
      }

      this.cursor += 1;
    }

    return blocks;
  }

  private readInlineBlock(closeType: string, softbreak: 'space' | 'newline'): Inline[] {
    this.cursor += 1;
    const token = this.tokens[this.cursor];
    const inlines = token?.type === 'inline' ? convertInlineTokens(token.children ?? [], softbreak) : [];
    if (token?.type === 'inline') this.cursor += 1;
    while (this.cursor < this.tokens.length && this.tokens[this.cursor]?.type !== closeType) this.cursor += 1;
    if (this.tokens[this.cursor]?.type === closeType) this.cursor += 1;
    return inlines;
  }

  private readList(): Extract<Block, { type: 'list' }> {
    const open = this.tokens[this.cursor]!;
    const ordered = open.type === 'ordered_list_open';
    const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';
    let nextNumber = Number.parseInt(String(open.attrGet('start') ?? '1'), 10);
    const items: ListItem[] = [];
    this.cursor += 1;

    while (this.cursor < this.tokens.length && this.tokens[this.cursor]?.type !== closeType) {
      const token = this.tokens[this.cursor]!;
      if (token.type !== 'list_item_open') {
        this.cursor += 1;
        continue;
      }
      const sourceNumber = Number.parseInt(token.info, 10);
      const marker: ListMarker = ordered
        ? { type: 'ordered', number: Number.isFinite(sourceNumber) ? sourceNumber : nextNumber }
        : { type: 'bullet' };
      const item = this.readListItem(marker);
      items.push(item);
      if (ordered) nextNumber = item.marker.type === 'ordered' ? item.marker.number + 1 : nextNumber + 1;
    }

    if (this.tokens[this.cursor]?.type === closeType) this.cursor += 1;
    return { type: 'list', items };
  }

  private readListItem(initialMarker: ListMarker): ListItem {
    let inlines: Inline[] = [];
    const children: ListItem[] = [];
    this.cursor += 1;

    while (this.cursor < this.tokens.length && this.tokens[this.cursor]?.type !== 'list_item_close') {
      const token = this.tokens[this.cursor]!;
      if (token.type === 'paragraph_open') {
        const paragraph = this.readInlineBlock('paragraph_close', 'space');
        inlines = appendInlineGroup(inlines, paragraph);
        continue;
      }
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        children.push(...this.readList().items);
        continue;
      }
      if (token.type === 'math_block') {
        const value = normalizeMath(token.content).trim();
        inlines = appendInlineGroup(inlines, [{ type: 'math', value, raw: wrapMath(value, token.markup, true) }]);
        this.cursor += 1;
        continue;
      }
      this.cursor += 1;
    }

    if (this.tokens[this.cursor]?.type === 'list_item_close') this.cursor += 1;
    const task = readTaskMarker(inlines);
    return {
      marker: task?.marker ?? initialMarker,
      inlines: task?.inlines ?? inlines,
      children,
    };
  }

  private readTable(): Extract<Block, { type: 'table' }> {
    let section: 'head' | 'body' = 'head';
    let activeRow: Inline[][] | null = null;
    let header: Inline[][] = [];
    const rows: Inline[][][] = [];
    const align: TableAlign[] = [];
    this.cursor += 1;

    while (this.cursor < this.tokens.length && this.tokens[this.cursor]?.type !== 'table_close') {
      const token = this.tokens[this.cursor]!;
      if (token.type === 'tbody_open') section = 'body';
      if (token.type === 'tr_open') activeRow = [];
      if (token.type === 'th_open' && activeRow) align.push(readCellAlign(token));
      if ((token.type === 'th_open' || token.type === 'td_open') && activeRow) {
        const inline = this.tokens[this.cursor + 1];
        activeRow.push(inline?.type === 'inline' ? convertInlineTokens(inline.children ?? [], 'space') : []);
      }
      if (token.type === 'tr_close' && activeRow) {
        if (section === 'head') header = activeRow;
        else rows.push(trimTrailingEmptyCells(activeRow));
        activeRow = null;
      }
      this.cursor += 1;
    }

    if (this.tokens[this.cursor]?.type === 'table_close') this.cursor += 1;
    return { type: 'table', align, header, rows };
  }

  private rawLines(token: Token): string {
    if (!token.map) return '';
    return this.lines.slice(token.map[0], token.map[1]).join('\n').trim();
  }

  private isFenceClosed(token: Token): boolean {
    if (!token.map || token.map[1] <= token.map[0] + 1) return false;
    const last = (this.lines[token.map[1] - 1] ?? '').trim();
    const marker = token.markup[0] ?? '`';
    const run = marker.repeat(token.markup.length);
    return last.startsWith(run) && last.slice(run.length).split('').every((char) => char === marker || /\s/.test(char));
  }
}

function convertInlineTokens(tokens: Token[], softbreak: 'space' | 'newline'): Inline[] {
  type Frame = {
    type: 'root' | 'strong' | 'em' | 'strike' | 'link';
    href?: string | undefined;
    children: Inline[];
  };
  const frames: Frame[] = [{ type: 'root', children: [] }];
  const current = () => frames[frames.length - 1]!.children;

  for (const token of tokens) {
    if (token.type === 'text') {
      current().push({ type: 'text', value: restoreProtected(token.content) });
      continue;
    }
    if (token.type === 'softbreak') {
      current().push({ type: 'text', value: softbreak === 'newline' ? '\n' : ' ' });
      continue;
    }
    if (token.type === 'hardbreak') {
      current().push({ type: 'text', value: '\n' });
      continue;
    }
    if (token.type === 'code_inline') {
      current().push({ type: 'code', value: restoreProtected(token.content) });
      continue;
    }
    if (token.type === 'math_inline') {
      const value = normalizeMath(token.content);
      current().push({ type: 'math', value, raw: wrapMath(value, token.markup, false) });
      continue;
    }
    if (token.type === 'image') {
      current().push({ type: 'text', value: token.content });
      continue;
    }
    if (token.type === 'html_inline') {
      current().push({ type: 'text', value: restoreProtected(token.content) });
      continue;
    }

    const openType = inlineOpenType(token.type);
    if (openType) {
      const href = token.attrGet('href');
      frames.push({ type: openType, href: href == null ? undefined : String(href), children: [] });
      continue;
    }

    if (token.nesting === -1 && frames.length > 1) {
      const frame = frames.pop()!;
      const children = finalizeInlineNodes(frame.children);
      if (frame.type === 'link') {
        if (frame.href && isSafeHttpUrl(frame.href)) current().push({ type: 'link', href: frame.href, children });
        else current().push(...children);
      } else if (frame.type !== 'root') {
        current().push({ type: frame.type, children });
      }
    }
  }

  while (frames.length > 1) {
    const frame = frames.pop()!;
    current().push(...finalizeInlineNodes(frame.children));
  }
  return finalizeInlineNodes(frames[0]!.children);
}

function inlineOpenType(type: string): 'strong' | 'em' | 'strike' | 'link' | null {
  if (type === 'strong_open') return 'strong';
  if (type === 'em_open') return 'em';
  if (type === 's_open') return 'strike';
  if (type === 'link_open') return 'link';
  return null;
}

function finalizeInlineNodes(nodes: Inline[]): Inline[] {
  return mergeAdjacentText(nodes).flatMap((node) => (node.type === 'text' ? parseLegacyText(node.value) : [node]));
}

function parseLegacyText(source: string): Inline[] {
  const nodes: Inline[] = [];
  let index = 0;
  let textStart = 0;

  const flush = (end: number) => {
    if (end > textStart) nodes.push({ type: 'text', value: source.slice(textStart, end) });
  };

  while (index < source.length) {
    const command = readLegacyTextCommand(source, index);
    if (command) {
      flush(index);
      if (command.command === 'it') nodes.push({ type: 'em', children: parseLegacyText(unescapeLegacyBraces(command.value)) });
      else if (command.command === 'tt') nodes.push({ type: 'code', value: command.value });
      else nodes.push(...parseLegacyText(unescapeLegacyBraces(command.value)));
      index = command.end;
      textStart = index;
      continue;
    }

    if (source[index] === '`') {
      const ticks = source[index + 1] === '`' ? 2 : 1;
      const closing = "'".repeat(ticks);
      const close = source.indexOf(closing, index + ticks);
      if (close > index + ticks) {
        flush(index);
        nodes.push({
          type: 'text',
          value: `${ticks === 2 ? '“' : '‘'}${source.slice(index + ticks, close)}${ticks === 2 ? '”' : '’'}`,
        });
        index = close + ticks;
        textStart = index;
        continue;
      }
    }
    index += 1;
  }

  flush(source.length);
  return mergeAdjacentText(nodes);
}

function readLegacyTextCommand(
  source: string,
  start: number,
): { command: 'it' | 'tt' | 'rm'; value: string; end: number } | null {
  if (source[start] !== '{' || source[start + 1] !== '\\') return null;
  const match = /^\{\\(it|tt|rm)(?:\s+|(?=\}))/.exec(source.slice(start));
  if (!match) return null;
  const contentStart = start + match[0].length;
  let depth = 1;

  for (let index = contentStart; index < source.length; index += 1) {
    if (source[index] === '\\' && index + 1 < source.length) {
      index += 1;
      continue;
    }
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          command: match[1] as 'it' | 'tt' | 'rm',
          value: source.slice(contentStart, index),
          end: index + 1,
        };
      }
    }
  }
  return null;
}

function protectIncompleteMath(source: string): string {
  let protectedSource = source
    .replaceAll('\\{', `${PROTECTED_SLASH}{`)
    .replaceAll('\\}', `${PROTECTED_SLASH}}`);
  protectedSource = protectUnclosedPairs(protectedSource, '\\(', '\\)', `${PROTECTED_SLASH}(`);
  protectedSource = protectUnclosedPairs(protectedSource, '\\[', '\\]', `${PROTECTED_SLASH}[`);

  const dollarPairs: number[] = [];
  let cursor = 0;
  while (cursor < protectedSource.length) {
    const found = protectedSource.indexOf('$$', cursor);
    if (found === -1) break;
    if (!isEscaped(protectedSource, found)) dollarPairs.push(found);
    cursor = found + 2;
  }
  if (dollarPairs.length % 2 === 1) {
    const index = dollarPairs[dollarPairs.length - 1]!;
    protectedSource = `${protectedSource.slice(0, index)}${PROTECTED_DOLLAR}${PROTECTED_DOLLAR}${protectedSource.slice(index + 2)}`;
  }
  return protectedSource;
}

function protectUnclosedPairs(source: string, open: string, close: string, replacement: string): string {
  let result = source;
  let cursor = 0;
  while (cursor < result.length) {
    const start = result.indexOf(open, cursor);
    if (start === -1) break;
    if (open === '\\[' && !/\s/.test(result[start + open.length] ?? '')) {
      cursor = start + open.length;
      continue;
    }
    const end = result.indexOf(close, start + open.length);
    if (end === -1) {
      result = `${result.slice(0, start)}${replacement}${result.slice(start + open.length)}`;
      cursor = start + replacement.length;
    } else {
      cursor = end + close.length;
    }
  }
  return result;
}

function restoreProtected(value: string): string {
  return value.replaceAll(PROTECTED_SLASH, '\\').replaceAll(PROTECTED_DOLLAR, '$');
}

function unescapeLegacyBraces(value: string): string {
  return value.replace(/\\([{}])/g, '$1');
}

function normalizeMath(value: string): string {
  return restoreProtected(value).replace(/\s*\r?\n\s*/g, ' ');
}

function wrapMath(value: string, markup: string, display: boolean): string {
  const open = markup || (display ? '$$' : '$');
  const close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
  return `${open}${value}${close}`;
}

function readTaskMarker(inlines: Inline[]): { marker: ListMarker; inlines: Inline[] } | null {
  const first = inlines[0];
  if (first?.type !== 'text') return null;
  const match = /^\[([ xX])\](?:\s+|$)/.exec(first.value);
  if (!match) return null;
  const next = first.value.slice(match[0].length);
  return {
    marker: { type: 'task', checked: match[1] !== ' ' },
    inlines: next ? [{ type: 'text', value: next }, ...inlines.slice(1)] : inlines.slice(1),
  };
}

function readCellAlign(token: Token): TableAlign {
  const style = String(token.attrGet('style') ?? '');
  if (style.includes('center')) return 'center';
  if (style.includes('right')) return 'right';
  if (style.includes('left')) return 'left';
  return null;
}

function trimTrailingEmptyCells(row: Inline[][]): Inline[][] {
  const trimmed = [...row];
  while (trimmed.length > 1 && trimmed.at(-1)?.length === 0) trimmed.pop();
  return trimmed;
}

function flattenBlocks(blocks: Block[]): Inline[] {
  const flattened: Inline[] = [];
  for (const block of blocks) {
    if (flattened.length) flattened.push({ type: 'text', value: '\n' });
    if ('inlines' in block) flattened.push(...block.inlines);
    else if (block.type === 'math') flattened.push({ type: 'math', value: block.value, raw: block.raw });
    else if (block.type === 'code') flattened.push({ type: 'code', value: block.text });
    else if (block.type === 'list') {
      block.items.forEach((item, index) => {
        if (index) flattened.push({ type: 'text', value: '\n' });
        flattened.push(...item.inlines);
      });
    }
  }
  return finalizeInlineNodes(flattened);
}

function appendInlineGroup(existing: Inline[], next: Inline[]): Inline[] {
  if (!existing.length) return next;
  if (!next.length) return existing;
  return finalizeInlineNodes([...existing, { type: 'text', value: '\n' }, ...next]);
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

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}
