import { consumeAutolink, isSafeHttpUrl } from '../index';

describe('isSafeHttpUrl', () => {
  it.each(['https://example.com', 'http://localhost:11434/v1', 'https://x.ai/path?q=1'])(
    'allows %s',
    (href) => expect(isSafeHttpUrl(href)).toBe(true),
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'ftp://example.com',
    'not a url',
    '',
  ])('rejects %s', (href) => expect(isSafeHttpUrl(href)).toBe(false));
});

describe('consumeAutolink', () => {
  it('reads a bare https URL', () => {
    expect(consumeAutolink('see https://example.com/docs for more', 4)).toBe('https://example.com/docs');
  });

  it('strips a trailing period and unmatched closing paren', () => {
    expect(consumeAutolink('https://example.com.', 0)).toBe('https://example.com');
    expect(consumeAutolink('(https://example.com/foo)', 1)).toBe('https://example.com/foo');
  });

  it('keeps balanced parentheses in the path', () => {
    expect(consumeAutolink('https://en.wikipedia.org/wiki/Foo_(bar)', 0)).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  it('returns null when the token is not a safe http(s) URL', () => {
    expect(consumeAutolink('javascript:alert(1)', 0)).toBeNull();
    expect(consumeAutolink('See the notes.', 0)).toBeNull();
    expect(consumeAutolink('http://', 0)).toBeNull();
  });
});
