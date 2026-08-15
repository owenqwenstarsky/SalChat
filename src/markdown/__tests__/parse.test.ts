import { parseInlines, parseMarkdown } from '../index';
import type { Block, Inline } from '../index';

function text(value: string): Inline {
  return { type: 'text', value };
}

describe('parseMarkdown blocks', () => {
  it('returns no blocks for empty or blank input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('  \n\n  ')).toEqual([]);
  });

  it('merges soft-wrapped paragraph lines and keeps a two-space hard break', () => {
    expect(parseMarkdown('hello\nworld')).toEqual<Block[]>([{ type: 'paragraph', inlines: [text('hello world')] }]);
    expect(parseMarkdown('hello  \nworld')).toEqual<Block[]>([{ type: 'paragraph', inlines: [text('hello\nworld')] }]);
  });

  it('parses ATX headings 1–6 and ignores hashes without a following space', () => {
    const levels = [1, 2, 3, 4, 5, 6] as const;
    for (const level of levels) {
      const source = `${'#'.repeat(level)} Title`;
      expect(parseMarkdown(source)).toEqual<Block[]>([{ type: 'heading', level, inlines: [text('Title')] }]);
    }
    expect(parseMarkdown('#not-a-heading')).toEqual<Block[]>([{ type: 'paragraph', inlines: [text('#not-a-heading')] }]);
  });

  it('parses fenced code with a language, an empty body, and an unclosed stream', () => {
    expect(parseMarkdown('```js\nconst x = 1\n```')).toEqual<Block[]>([
      { type: 'code', language: 'js', text: 'const x = 1', closed: true },
    ]);
    expect(parseMarkdown('```\n```')).toEqual<Block[]>([{ type: 'code', language: '', text: '', closed: true }]);
    expect(parseMarkdown('```python\nprint(1)')).toEqual<Block[]>([
      { type: 'code', language: 'python', text: 'print(1)', closed: false },
    ]);
  });

  it('does not treat mid-line backticks as a fence', () => {
    expect(parseMarkdown('use ``` fences sparingly')).toEqual<Block[]>([
      { type: 'paragraph', inlines: [text('use ``` fences sparingly')] },
    ]);
  });

  it('parses bullet, ordered, and task lists plus one nested level', () => {
    const source = ['- alpha', '- [ ] todo', '- [x] done', '  - nested', '1. first', '2. second'].join('\n');
    expect(parseMarkdown(source)).toEqual<Block[]>([
      {
        type: 'list',
        items: [
          { marker: { type: 'bullet' }, inlines: [text('alpha')], children: [] },
          { marker: { type: 'task', checked: false }, inlines: [text('todo')], children: [] },
          {
            marker: { type: 'task', checked: true },
            inlines: [text('done')],
            children: [{ marker: { type: 'bullet' }, inlines: [text('nested')], children: [] }],
          },
        ],
      },
      {
        type: 'list',
        items: [
          { marker: { type: 'ordered', number: 1 }, inlines: [text('first')], children: [] },
          { marker: { type: 'ordered', number: 2 }, inlines: [text('second')], children: [] },
        ],
      },
    ]);
  });

  it('parses blockquotes and thematic rules', () => {
    expect(parseMarkdown('> one\n> two')).toEqual<Block[]>([{ type: 'quote', inlines: [text('one\ntwo')] }]);
    expect(parseMarkdown('---')).toEqual<Block[]>([{ type: 'rule' }]);
    expect(parseMarkdown('***')).toEqual<Block[]>([{ type: 'rule' }]);
  });

  it('parses a GFM table and keeps a streamed half-row', () => {
    const source = ['| Name | Size |', '| --- | ---: |', '| a | **9** |', '| b |'].join('\n');
    expect(parseMarkdown(source)).toEqual<Block[]>([
      {
        type: 'table',
        align: [null, 'right'],
        header: [[text('Name')], [text('Size')]],
        rows: [
          [[text('a')], [{ type: 'strong', children: [text('9')] }]],
          [[text('b')]],
        ],
      },
    ]);
  });

  it('treats a pipe row without a separator as a paragraph', () => {
    expect(parseMarkdown('| not | a table')).toEqual<Block[]>([{ type: 'paragraph', inlines: [text('| not | a table')] }]);
  });

  it('covers remaining block edges: plus lists, 1) markers, underscores, quotes, and table alignment', () => {
    expect(parseMarkdown('+ plus')).toEqual<Block[]>([
      { type: 'list', items: [{ marker: { type: 'bullet' }, inlines: [text('plus')], children: [] }] },
    ]);
    expect(parseMarkdown('3) third')).toEqual<Block[]>([
      { type: 'list', items: [{ marker: { type: 'ordered', number: 3 }, inlines: [text('third')], children: [] }] },
    ]);
    expect(parseMarkdown('___')).toEqual<Block[]>([{ type: 'rule' }]);
    expect(parseMarkdown('>no-space')).toEqual<Block[]>([{ type: 'quote', inlines: [text('no-space')] }]);
    expect(parseMarkdown('  - orphan nested')).toEqual<Block[]>([
      { type: 'list', items: [{ marker: { type: 'bullet' }, inlines: [text('orphan nested')], children: [] }] },
    ]);
    expect(parseMarkdown('| a | b |\n| :--- | :---: |\n| 1 | 2 |\n# After')).toEqual<Block[]>([
      {
        type: 'table',
        align: ['left', 'center'],
        header: [[text('a')], [text('b')]],
        rows: [[[text('1')], [text('2')]]],
      },
      { type: 'heading', level: 1, inlines: [text('After')] },
    ]);
  });

  it('ends a paragraph when the next line is a flush list item', () => {
    expect(parseMarkdown('hello\n- world')).toEqual<Block[]>([
      { type: 'paragraph', inlines: [text('hello')] },
      { type: 'list', items: [{ marker: { type: 'bullet' }, inlines: [text('world')], children: [] }] },
    ]);
  });

  it('nests a tab-indented child under the previous item', () => {
    expect(parseMarkdown('- parent\n\t- child')).toEqual<Block[]>([
      {
        type: 'list',
        items: [
          {
            marker: { type: 'bullet' },
            inlines: [text('parent')],
            children: [{ marker: { type: 'bullet' }, inlines: [text('child')], children: [] }],
          },
        ],
      },
    ]);
  });

  it('does not treat a deeply indented triple-backtick line as a fence', () => {
    expect(parseMarkdown('    ```\nstill text')).toEqual<Block[]>([
      { type: 'paragraph', inlines: [text('    ``` still text')] },
    ]);
  });
});

describe('parseInlines', () => {
  it('parses emphasis, strong, nested *** , strike, and inline code', () => {
    expect(parseInlines('**bold** and *italic* and ~~old~~ and `code`')).toEqual<Inline[]>([
      { type: 'strong', children: [text('bold')] },
      text(' and '),
      { type: 'em', children: [text('italic')] },
      text(' and '),
      { type: 'strike', children: [text('old')] },
      text(' and '),
      { type: 'code', value: 'code' },
    ]);
    expect(parseInlines('***both***')).toEqual<Inline[]>([
      { type: 'strong', children: [{ type: 'em', children: [text('both')] }] },
    ]);
    expect(parseInlines('**bold *and italic* still**')).toEqual<Inline[]>([
      {
        type: 'strong',
        children: [text('bold '), { type: 'em', children: [text('and italic')] }, text(' still')],
      },
    ]);
  });

  it('leaves unmatched markers visible so streaming does not flicker', () => {
    expect(parseInlines('**bold')).toEqual<Inline[]>([text('**bold')]);
    expect(parseInlines('*italic')).toEqual<Inline[]>([text('*italic')]);
    expect(parseInlines('~~gone')).toEqual<Inline[]>([text('~~gone')]);
    expect(parseInlines('`code')).toEqual<Inline[]>([text('`code')]);
  });

  it('parses markdown links and autolinks, and drops unsafe hrefs to text', () => {
    expect(parseInlines('see [docs](https://example.com) please')).toEqual<Inline[]>([
      text('see '),
      { type: 'link', href: 'https://example.com', children: [text('docs')] },
      text(' please'),
    ]);
    expect(parseInlines('go https://example.com/path.')).toEqual<Inline[]>([
      text('go '),
      { type: 'link', href: 'https://example.com/path', children: [text('https://example.com/path')] },
      text('.'),
    ]);
    expect(parseInlines('[click](javascript:alert(1)) now')).toEqual<Inline[]>([text('click now')]);
    expect(parseInlines('[nope](data:text/html,x)')).toEqual<Inline[]>([text('nope')]);
  });

  it('honors backslash escapes and double-backtick code that contains a tick', () => {
    expect(parseInlines('\\*not italic\\* and \\[link]')).toEqual<Inline[]>([text('*not italic* and [link]')]);
    expect(parseInlines('`` a`b ``')).toEqual<Inline[]>([{ type: 'code', value: ' a`b ' }]);
  });

  it('parses angle-bracket destinations, escaped labels, and skips code when closing emphasis', () => {
    expect(parseInlines('[docs](<https://example.com>)')).toEqual<Inline[]>([
      { type: 'link', href: 'https://example.com', children: [text('docs')] },
    ]);
    expect(parseInlines('[see \\[this\\]](https://example.com)')).toEqual<Inline[]>([
      { type: 'link', href: 'https://example.com', children: [text('see [this]')] },
    ]);
    expect(parseInlines('**keep `**` ticks**')).toEqual<Inline[]>([
      { type: 'strong', children: [text('keep '), { type: 'code', value: '**' }, text(' ticks')] },
    ]);
    expect(parseInlines('*a\\*b*')).toEqual<Inline[]>([{ type: 'em', children: [text('a*b')] }]);
    expect(parseInlines('[docs](<https://example.com')).toEqual<Inline[]>([
      text('[docs](<'),
      { type: 'link', href: 'https://example.com', children: [text('https://example.com')] },
    ]);
    expect(parseInlines('[docs](https://example.com/foo(bar))')).toEqual<Inline[]>([
      { type: 'link', href: 'https://example.com/foo(bar)', children: [text('docs')] },
    ]);
  });
});
