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

  it('keeps soft-wrapped list continuations in one item so inline math can cross source lines', () => {
    expect(parseMarkdown('- before $x +\ny$ after\n- next')).toEqual<Block[]>([
      {
        type: 'list',
        items: [
          {
            marker: { type: 'bullet' },
            inlines: [
              text('before '),
              { type: 'math', value: 'x + y', raw: '$x + y$' },
              text(' after'),
            ],
            children: [],
          },
          { marker: { type: 'bullet' }, inlines: [text('next')], children: [] },
        ],
      },
    ]);
  });

  it('ends lazy list continuation at blank lines and block boundaries', () => {
    expect(parseMarkdown('- item\ncontinued\n\nafter')).toEqual<Block[]>([
      {
        type: 'list',
        items: [{ marker: { type: 'bullet' }, inlines: [text('item continued')], children: [] }],
      },
      { type: 'paragraph', inlines: [text('after')] },
    ]);
    expect(parseMarkdown('- item\n# Heading')).toEqual<Block[]>([
      { type: 'list', items: [{ marker: { type: 'bullet' }, inlines: [text('item')], children: [] }] },
      { type: 'heading', level: 1, inlines: [text('Heading')] },
    ]);
  });

  it('uses CommonMark indented-code behavior for a deeply indented fence marker', () => {
    expect(parseMarkdown('    ```\nstill text')).toEqual<Block[]>([
      { type: 'code', language: '', text: '```', closed: true },
      { type: 'paragraph', inlines: [text('still text')] },
    ]);
  });

  it('parses single-line and multiline display math with both delimiter styles', () => {
    expect(parseMarkdown('Before\n$$x = \\frac{8}{9}$$\nAfter')).toEqual<Block[]>([
      { type: 'paragraph', inlines: [text('Before')] },
      { type: 'math', value: 'x = \\frac{8}{9}', raw: '$$x = \\frac{8}{9}$$' },
      { type: 'paragraph', inlines: [text('After')] },
    ]);
    expect(parseMarkdown('\\[\n  a^2 + b^2 = c^2\n\\]')).toEqual<Block[]>([
      {
        type: 'math',
        value: 'a^2 + b^2 = c^2',
        raw: '\\[\n  a^2 + b^2 = c^2\n\\]',
      },
    ]);
  });

  it('keeps incomplete display math literal while a response streams', () => {
    expect(parseMarkdown('$$\nx + y')).toEqual<Block[]>([
      { type: 'paragraph', inlines: [text('$$ x + y')] },
    ]);
    expect(parseMarkdown('\\[\nx + y')).toEqual<Block[]>([
      { type: 'paragraph', inlines: [text('\\[ x + y')] },
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
      { type: 'em', children: [{ type: 'strong', children: [text('both')] }] },
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
    expect(parseInlines('`` a`b ``')).toEqual<Inline[]>([{ type: 'code', value: 'a`b' }]);
  });

  it('parses legacy TeX text commands without affecting commands inside math', () => {
    expect(parseInlines('{\\it sic}, {\\tt 2}, and {\\rm plain}')).toEqual<Inline[]>([
      { type: 'em', children: [text('sic')] },
      text(', '),
      { type: 'code', value: '2' },
      text(', and plain'),
    ]);
    expect(parseInlines('$\\mathrm{N}$ and {\\it nested {words}}')).toEqual<Inline[]>([
      { type: 'math', value: '\\mathrm{N}', raw: '$\\mathrm{N}$' },
      text(' and '),
      { type: 'em', children: [text('nested {words}')] },
    ]);
    expect(parseInlines('{\\it escaped \\} brace}')).toEqual<Inline[]>([
      { type: 'em', children: [text('escaped } brace')] },
    ]);
  });

  it('converts TeX-style quotes while preserving valid Markdown code and incomplete streams', () => {
    expect(parseInlines("`single' and ``double''")).toEqual<Inline[]>([text('‘single’ and “double”')]);
    expect(parseInlines('`markdown code`')).toEqual<Inline[]>([{ type: 'code', value: 'markdown code' }]);
    expect(parseInlines("streaming `quote")).toEqual<Inline[]>([text('streaming `quote')]);
    expect(parseInlines('{\\it streaming')).toEqual<Inline[]>([text('{\\it streaming')]);
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

  it('parses inline dollar and parenthesized math alongside markdown', () => {
    expect(parseInlines('Use $x = \\frac{8}{9}$ or \\(y^2\\).')).toEqual<Inline[]>([
      text('Use '),
      { type: 'math', value: 'x = \\frac{8}{9}', raw: '$x = \\frac{8}{9}$' },
      text(' or '),
      { type: 'math', value: 'y^2', raw: '\\(y^2\\)' },
      text('.'),
    ]);
    expect(parseInlines('**Area is $\\pi r^2$**')).toEqual<Inline[]>([
      {
        type: 'strong',
        children: [text('Area is '), { type: 'math', value: '\\pi r^2', raw: '$\\pi r^2$' }],
      },
    ]);
  });

  it('keeps math delimiters literal in code, escapes, currency, and incomplete streams', () => {
    expect(parseInlines('`$x$` and \\$5')).toEqual<Inline[]>([
      { type: 'code', value: '$x$' },
      text(' and $5'),
    ]);
    expect(parseInlines('Costs $5 and $10 today')).toEqual<Inline[]>([text('Costs $5 and $10 today')]);
    expect(parseInlines('Double $$x$$ stays inline text')).toEqual<Inline[]>([text('Double $$x$$ stays inline text')]);
    expect(parseInlines('streaming $x + 1')).toEqual<Inline[]>([text('streaming $x + 1')]);
    expect(parseInlines('streaming \\(x + 1')).toEqual<Inline[]>([text('streaming \\(x + 1')]);
    expect(parseInlines("empty `'")).toEqual<Inline[]>([text("empty `'")]);
  });

  it('allows inline math across a Markdown soft line break', () => {
    expect(parseInlines('$x\ny$')).toEqual<Inline[]>([{ type: 'math', value: 'x y', raw: '$x y$' }]);
  });

  it('skips escaped closing delimiters when finding inline math boundaries', () => {
    expect(parseInlines('$x + \\$y$')).toEqual<Inline[]>([
      { type: 'math', value: 'x + \\$y', raw: '$x + \\$y$' },
    ]);
    expect(parseInlines('\\(x + \\\\) y\\)')).toEqual<Inline[]>([
      { type: 'math', value: 'x + \\\\) y', raw: '\\(x + \\\\) y\\)' },
    ]);
  });
});

describe('legacy TeX response regression', () => {
  const source = `The clock is on its side. By the figures
printed on the dial it is about \`10 to.'

* {\\it sic}  $\\approx 02{\\rm{:}}50{\\cal_{15s}}\\approx
14{\\rm{:}}50$ - about $2^{h}51^{m}$ if you want the
$\\,{\\rm sec}$ hand.

If you put the clock back the right way up

* 12 at the top

the short thick hand is $\\approx 5/6$ of the way from
{\\tt 2} to {\\tt 3} and the long hand is right on {\\tt 10}
$=50^{m}$ - with the thin hand about $14-15^{s}$ past
the 12 - {\\it i. e.} in normal english \`\`ten minutes to
three.''

In the coordinates of the photograph the clock has been
turned $90^{o}$ anti clockwise, $12$ is to the left of
the picture, $3$ is to the top {\\it etc.} so with respect
to the top of the picture the two hands are to the
\${\\rm N}$ and to the \${\\rm SW}$ - about $11{\\rm{:}}50$
\${\\rm pm}$ $\\approx 05{\\rm{:}}50$ in absolute
top=12 coordinates.`;

  it('parses the complete sample without leaking legacy text markup', () => {
    const blocks = parseMarkdown(source);
    const firstParagraph = blocks[0];
    const firstList = blocks[1];
    const explanation = blocks[4];

    expect(firstParagraph).toEqual<Block>({
      type: 'paragraph',
      inlines: [text('The clock is on its side. By the figures printed on the dial it is about ‘10 to.’')],
    });
    expect(firstList).toEqual<Block>({
      type: 'list',
      items: [
        {
          marker: { type: 'bullet' },
          inlines: [
            { type: 'em', children: [text('sic')] },
            text('  '),
            {
              type: 'math',
              value: '\\approx 02{\\rm{:}}50{\\cal_{15s}}\\approx 14{\\rm{:}}50',
              raw: '$\\approx 02{\\rm{:}}50{\\cal_{15s}}\\approx 14{\\rm{:}}50$',
            },
            text(' - about '),
            { type: 'math', value: '2^{h}51^{m}', raw: '$2^{h}51^{m}$' },
            text(' if you want the '),
            { type: 'math', value: '\\,{\\rm sec}', raw: '$\\,{\\rm sec}$' },
            text(' hand.'),
          ],
          children: [],
        },
      ],
    });
    expect(explanation).toMatchObject({
      type: 'paragraph',
      inlines: expect.arrayContaining([
        { type: 'code', value: '2' },
        { type: 'code', value: '3' },
        { type: 'code', value: '10' },
        { type: 'em', children: [text('i. e.')] },
      ]),
    });

    const serialized = JSON.stringify(blocks);
    expect(serialized).toContain('“ten minutes to three.”');
    expect(serialized).not.toContain('{\\\\it sic}');
    expect(serialized).not.toContain('{\\\\tt 2}');
  });
});
