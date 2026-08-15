import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from '@/theme';

/**
 * A deliberately small, linear-time renderer for common model output. Keeping
 * parsing local avoids handing untrusted model text to a regex-heavy Markdown
 * parser while preserving the structures that matter most in chat.
 */
export function AssistantText({ children }: { children: string }) {
  const theme = useTheme();
  const blocks: ReactNode[] = [];
  const lines = children.split('\n');
  let code: string[] | null = null;
  let codeLanguage = '';

  for (const [index, line] of lines.entries()) {
    if (line.startsWith('```')) {
      if (code) {
        blocks.push(
          <View key={`code-${index}`} style={[styles.code, { backgroundColor: theme.surface, borderColor: theme.line }]}>
            {codeLanguage ? <Text style={[styles.language, { color: theme.muted }]}>{codeLanguage}</Text> : null}
            <Text selectable style={[styles.codeText, { color: theme.text }]}>{code.join('\n')}</Text>
          </View>,
        );
        code = null;
        codeLanguage = '';
      } else {
        code = [];
        codeLanguage = line.slice(3).trim().slice(0, 40);
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    const headingLevel = countHeadingPrefix(line);
    if (headingLevel) {
      blocks.push(<Text selectable key={index} style={[styles.heading, headingLevel > 2 && styles.smallHeading, { color: theme.text }]}>{line.slice(headingLevel + 1)}</Text>);
      continue;
    }
    const bullet = line.startsWith('- ') || line.startsWith('* ');
    blocks.push(
      <Text selectable key={index} style={[styles.body, bullet && styles.bullet, { color: theme.text }]}>
        {bullet ? '•  ' : ''}{inlineCode(line.slice(bullet ? 2 : 0), theme.surface)}{index < lines.length - 1 ? '\n' : ''}
      </Text>,
    );
  }

  if (code) {
    blocks.push(
      <View key="code-open" style={[styles.code, { backgroundColor: theme.surface, borderColor: theme.line }]}>
        {codeLanguage ? <Text style={[styles.language, { color: theme.muted }]}>{codeLanguage}</Text> : null}
        <Text selectable style={[styles.codeText, { color: theme.text }]}>{code.join('\n')}</Text>
      </View>,
    );
  }

  return <View>{blocks}</View>;
}

function countHeadingPrefix(value: string): number {
  let count = 0;
  while (count < value.length && count < 6 && value[count] === '#') count += 1;
  return count > 0 && value[count] === ' ' ? count : 0;
}

function inlineCode(value: string, backgroundColor: string): ReactNode[] {
  const pieces = value.split('`');
  return pieces.map((piece, index) => (
    <Fragment key={index}>
      <Text style={index % 2 ? [styles.inlineCode, { backgroundColor }] : undefined}>{piece}</Text>
    </Fragment>
  ));
}

const styles = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 24 },
  bullet: { paddingLeft: 7 },
  heading: { fontSize: 21, lineHeight: 28, fontWeight: '800', marginTop: 10, marginBottom: 3 },
  smallHeading: { fontSize: 17, lineHeight: 24 },
  code: { borderWidth: 1, borderRadius: radius.md, padding: 12, marginVertical: 7 },
  codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  language: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 7 },
  inlineCode: { fontFamily: 'monospace', fontSize: 14 },
});
