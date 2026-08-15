import { NdjsonParser, SseParser } from '../streams';

describe('SSE parser', () => {
  it('handles CRLF, comments, multi-line data, and arbitrary splits', () => {
    const parser = new SseParser();
    expect(parser.push('\uFEFF: ping\r\nevent: chunk\r\nid: 7\r\ndata: {"a"')).toEqual([]);
    expect(parser.push(':1}\r\ndata: second\r\n\r\n')).toEqual([{ event: 'chunk', id: '7', data: '{"a":1}\nsecond' }]);
  });

  it('flushes a final event without a blank terminator', () => {
    const parser = new SseParser();
    parser.push('data: [DONE]');
    expect(parser.finish()[0]?.data).toBe('[DONE]');
  });
});

describe('NDJSON parser', () => {
  it('handles split Unicode-safe text chunks and a final unterminated line', () => {
    const parser = new NdjsonParser<{ value: string }>();
    expect(parser.push('{"value":"one"}\n{"value"')).toEqual([{ value: 'one' }]);
    expect(parser.push(':"two"}\n')).toEqual([{ value: 'two' }]);
    parser.push('{"value":"tail"}');
    expect(parser.finish()).toEqual([{ value: 'tail' }]);
  });

  it('surfaces malformed provider JSON', () => {
    const parser = new NdjsonParser();
    expect(() => parser.push('{bad}\n')).toThrow();
  });
});
