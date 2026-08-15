import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { isSafeHttpUrl, parseMarkdown } from '@/markdown';
import type { Block, Inline, ListItem, TableAlign } from '@/markdown';
import { useSalStore } from '@/state/store';
import { font, radius, useTheme, type SalTheme } from '@/theme';

export function MessageText({ children, tone }: { children: string; tone: 'assistant' | 'user' }) {
  const theme = useTheme();
  const blocks = useMemo(() => parseMarkdown(children), [children]);
  return (
    <View style={[styles.stack, tone === 'user' && styles.userStack]}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} first={index === 0} theme={theme} tone={tone} />
      ))}
    </View>
  );
}

function BlockView({
  block,
  first,
  theme,
  tone,
}: {
  block: Block;
  first: boolean;
  theme: SalTheme;
  tone: 'assistant' | 'user';
}) {
  switch (block.type) {
    case 'paragraph':
      return <RichText nodes={block.inlines} theme={theme} tone={tone} style={[styles.body, { color: theme.text }]} />;
    case 'heading':
      return (
        <RichText
          nodes={block.inlines}
          theme={theme}
          tone={tone}
          style={[
            styles.heading,
            headingSize(block.level, tone),
            !first && (tone === 'user' ? styles.headingFollowUser : styles.headingFollow),
            { color: theme.text },
          ]}
        />
      );
    case 'list':
      return <ListView items={block.items} theme={theme} tone={tone} />;
    case 'code':
      return <CodeBlock language={block.language} text={block.text} closed={block.closed} theme={theme} tone={tone} />;
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: theme.accent }]}>
          <RichText nodes={block.inlines} theme={theme} tone={tone} style={[styles.body, styles.quoteText, { color: theme.muted }]} />
        </View>
      );
    case 'table':
      return <TableView header={block.header} rows={block.rows} align={block.align} theme={theme} tone={tone} />;
    case 'rule':
      return <View style={[styles.rule, { backgroundColor: theme.line }]} />;
  }
}

function ListView({ items, theme, tone, nested }: { items: ListItem[]; theme: SalTheme; tone: 'assistant' | 'user'; nested?: boolean }) {
  return (
    <View style={nested ? styles.nestedList : undefined}>
      {items.map((item, index) => (
        <View key={index}>
          <View style={styles.listRow}>
            <ListMarkerView marker={item.marker} theme={theme} />
            <RichText nodes={item.inlines} theme={theme} tone={tone} style={[styles.body, styles.listBody, { color: theme.text }]} />
          </View>
          {item.children.length ? <ListView items={item.children} theme={theme} tone={tone} nested /> : null}
        </View>
      ))}
    </View>
  );
}

function ListMarkerView({ marker, theme }: { marker: ListItem['marker']; theme: SalTheme }) {
  if (marker.type === 'task') {
    return (
      <View style={[styles.task, { borderColor: marker.checked ? theme.positive : theme.line, backgroundColor: marker.checked ? theme.positive : 'transparent' }]}>
        {marker.checked ? <Text style={styles.taskCheck}>✓</Text> : null}
      </View>
    );
  }
  return (
    <Text style={[styles.marker, { color: theme.muted }]}>{marker.type === 'ordered' ? `${marker.number}.` : '•'}</Text>
  );
}

function CodeBlock({
  language,
  text,
  closed,
  theme,
  tone,
}: {
  language: string;
  text: string;
  closed: boolean;
  theme: SalTheme;
  tone: 'assistant' | 'user';
}) {
  const hapticsEnabled = useSalStore((state) => state.settings.hapticsEnabled);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(text);
    } catch {
      return;
    }
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  const showChrome = Boolean(language) || closed;
  return (
    <View
      style={[
        styles.code,
        {
          backgroundColor: tone === 'user' ? theme.well : theme.surface,
          borderColor: theme.line,
        },
      ]}
    >
      {showChrome ? (
        <View style={styles.codeHead}>
          <Text style={[styles.language, { color: theme.muted }]}>{language}</Text>
          {closed ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Copy code" hitSlop={8} onPress={() => void copy()}>
              <Text style={[styles.copy, { color: copied ? theme.positive : theme.muted }]}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false}>
        <Text selectable style={[styles.codeText, { color: theme.text }]}>{text}</Text>
      </ScrollView>
    </View>
  );
}

function TableView({
  header,
  rows,
  align,
  theme,
  tone,
}: {
  header: Inline[][];
  rows: Inline[][][];
  align: TableAlign[];
  theme: SalTheme;
  tone: 'assistant' | 'user';
}) {
  return (
    <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false}>
      <View style={[styles.table, { backgroundColor: tone === 'user' ? theme.surface : theme.well, borderColor: theme.line }]}>
        <View style={[styles.tableRow, styles.tableHead, { borderBottomColor: theme.line }]}>
          {header.map((cell, index) => (
            <TableCell key={index} nodes={cell} theme={theme} tone={tone} align={align[index] ?? null} header />
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.tableRow, rowIndex < rows.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            {row.map((cell, index) => (
              <TableCell key={index} nodes={cell} theme={theme} tone={tone} align={align[index] ?? null} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function TableCell({
  nodes,
  theme,
  tone,
  align,
  header,
}: {
  nodes: Inline[];
  theme: SalTheme;
  tone: 'assistant' | 'user';
  align: TableAlign;
  header?: boolean;
}) {
  return (
    <View style={styles.tableCell}>
      <RichText
        nodes={nodes}
        theme={theme}
        tone={tone}
        style={[
          styles.tableText,
          header && styles.tableHeaderText,
          { color: theme.text, textAlign: align ?? 'left' },
        ]}
      />
    </View>
  );
}

function RichText({
  nodes,
  theme,
  tone,
  style,
}: {
  nodes: Inline[];
  theme: SalTheme;
  tone: 'assistant' | 'user';
  style: StyleProp<TextStyle>;
}) {
  return (
    <Text selectable style={style}>
      {nodes.map((node, index) => (
        <InlineView key={index} node={node} theme={theme} tone={tone} />
      ))}
    </Text>
  );
}

function InlineView({ node, theme, tone }: { node: Inline; theme: SalTheme; tone: 'assistant' | 'user' }): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'code':
      return (
        <Text style={[styles.inlineCode, { backgroundColor: tone === 'user' ? theme.well : theme.surface, color: theme.text }]}>
          {node.value}
        </Text>
      );
    case 'strong':
      return (
        <Text style={styles.strong}>
          {node.children.map((child, index) => (
            <InlineView key={index} node={child} theme={theme} tone={tone} />
          ))}
        </Text>
      );
    case 'em':
      return (
        <Text style={styles.em}>
          {node.children.map((child, index) => (
            <InlineView key={index} node={child} theme={theme} tone={tone} />
          ))}
        </Text>
      );
    case 'strike':
      return (
        <Text style={styles.strike}>
          {node.children.map((child, index) => (
            <InlineView key={index} node={child} theme={theme} tone={tone} />
          ))}
        </Text>
      );
    case 'link':
      return (
        <Text
          style={[styles.link, { color: theme.accent }]}
          onPress={() => {
            if (isSafeHttpUrl(node.href)) void Linking.openURL(node.href).catch(() => undefined);
          }}
        >
          {node.children.map((child, index) => (
            <InlineView key={index} node={child} theme={theme} tone={tone} />
          ))}
        </Text>
      );
  }
}

function headingSize(level: 1 | 2 | 3 | 4 | 5 | 6, tone: 'assistant' | 'user') {
  if (tone === 'user') return styles.headingUser;
  if (level === 1) return styles.heading1;
  if (level === 2) return styles.heading2;
  return styles.headingSmall;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  userStack: { gap: 6 },
  body: { fontSize: 16, lineHeight: 24, fontFamily: font.regular },
  heading: { fontFamily: font.bold, letterSpacing: -0.3 },
  heading1: { fontSize: 22, lineHeight: 28 },
  heading2: { fontSize: 19, lineHeight: 26 },
  headingSmall: { fontSize: 17, lineHeight: 24 },
  headingUser: { fontSize: 17, lineHeight: 22 },
  headingFollow: { marginTop: 6 },
  headingFollowUser: { marginTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  listBody: { flex: 1 },
  nestedList: { marginLeft: 18, marginTop: 4 },
  marker: { width: 22, paddingTop: 3, fontSize: 16, lineHeight: 24, fontFamily: font.regular, textAlign: 'right' },
  task: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    marginTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCheck: { color: '#FFF', fontSize: 10, fontFamily: font.bold, lineHeight: 12 },
  quote: { borderLeftWidth: 2, paddingLeft: 10 },
  quoteText: { fontStyle: 'italic' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  code: { borderRadius: radius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  codeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
  language: { fontSize: 10, fontFamily: font.semibold, textTransform: 'uppercase', flex: 1 },
  copy: { fontSize: 10, fontFamily: font.semibold, letterSpacing: 0.3 },
  codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  inlineCode: { fontFamily: 'monospace', fontSize: 14, borderRadius: 4 },
  strong: { fontFamily: font.bold },
  em: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  table: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  tableHead: { borderBottomWidth: StyleSheet.hairlineWidth },
  tableCell: { minWidth: 88, maxWidth: 220, paddingHorizontal: 10, paddingVertical: 7 },
  tableText: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  tableHeaderText: { fontFamily: font.semibold },
});
