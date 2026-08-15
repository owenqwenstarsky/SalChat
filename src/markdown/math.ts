import katex from 'katex';

export function renderMathToHtml(value: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(value, {
      displayMode,
      output: 'mathml',
      throwOnError: true,
      trust: false,
      strict: 'warn',
      maxExpand: 1000,
      maxSize: 20,
    });
  } catch {
    return null;
  }
}
