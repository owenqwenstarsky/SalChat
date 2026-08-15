import { renderMathToHtml } from '../math';

describe('renderMathToHtml', () => {
  it('renders inline and display equations with accessible MathML', () => {
    const inline = renderMathToHtml('x = \\frac{8}{9}', false);
    const display = renderMathToHtml('a^2 + b^2 = c^2', true);

    expect(inline).toContain('class="katex"');
    expect(inline).toContain('<math');
    expect(inline).toContain('<mfrac>');
    expect(display).toContain('display="block"');
  });

  it('returns null for malformed math so the UI can show the original source', () => {
    expect(renderMathToHtml('\\frac{', false)).toBeNull();
  });

  it('does not emit trusted javascript links', () => {
    const html = renderMathToHtml('\\href{javascript:alert(1)}{unsafe}', false);
    expect(html).not.toContain('href="javascript:');
  });

  it.each([
    '\\approx 02{\\rm{:}}50{\\cal_{15s}}\\approx 14{\\rm{:}}50',
    '2^{h}51^{m}',
    '\\,{\\rm sec}',
    '\\approx 5/6',
    '=50^{m}',
    '14-15^{s}',
    '90^{o}',
    '{\\rm N}',
    '{\\rm SW}',
    '11{\\rm{:}}50',
    '{\\rm pm}',
    '\\approx 05{\\rm{:}}50',
  ])('renders legacy formula %s from real model output', (formula) => {
    const html = renderMathToHtml(formula, false);
    expect(html).toContain('<math');
    expect(html).not.toContain('katex-error');
  });
});
