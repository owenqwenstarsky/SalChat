import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, space, useTheme } from '@/theme';

export function PrimaryButton({ children, onPress, disabled, compact, loading, testID }: PropsWithChildren<{ onPress: () => void; disabled?: boolean; compact?: boolean; loading?: boolean; testID?: string }>) {
  const theme = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, compact && styles.compact, { backgroundColor: disabled ? theme.line : theme.accent, opacity: pressed ? 0.78 : 1 }]}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{children}</Text>}</Pressable>;
}

export function GhostButton({ children, onPress, danger, compact }: PropsWithChildren<{ onPress: () => void; danger?: boolean; compact?: boolean }>) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ghost, compact && styles.compact, { borderColor: theme.line, opacity: pressed ? 0.65 : 1 }]}><Text style={[styles.ghostText, { color: danger ? theme.danger : theme.text }]}>{children}</Text></Pressable>;
}

export function Field({ label, hint, ...props }: React.ComponentProps<typeof TextInput> & { label: string; hint?: string }) {
  const theme = useTheme();
  return <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput placeholderTextColor={theme.muted} {...props} style={[styles.input, props.multiline && styles.multiline, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface }, props.style]} />{hint ? <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text> : null}</View>;
}

export function Section({ title, description, children, action }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode }>) {
  const theme = useTheme();
  return <View style={styles.section}><View style={styles.sectionHeader}><View style={{ flex: 1 }}><Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>{description ? <Text style={[styles.description, { color: theme.muted }]}>{description}</Text> : null}</View>{action}</View>{children}</View>;
}

export function Divider() { const theme = useTheme(); return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.line }} />; }

export function EmptyState({ symbol, title, body, action }: { symbol: string; title: string; body: string; action?: ReactNode }) {
  const theme = useTheme();
  return <View style={styles.empty}><Text style={styles.symbol}>{symbol}</Text><Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.emptyBody, { color: theme.muted }]}>{body}</Text>{action}</View>;
}

export function Pill({ children, active, onPress }: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  const theme = useTheme();
  return <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.pill, { backgroundColor: active ? theme.accentSoft : theme.surface, borderColor: active ? theme.accent : theme.line, opacity: pressed ? 0.7 : 1 }]}><Text numberOfLines={1} style={[styles.pillText, { color: active ? theme.accent : theme.text }]}>{children}</Text></Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, compact: { minHeight: 38, paddingHorizontal: 14 },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '800' }, ghost: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, ghostText: { fontSize: 14, fontWeight: '700' },
  field: { gap: 7, marginBottom: space.lg }, label: { fontSize: 13, fontWeight: '700' }, input: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 }, multiline: { minHeight: 104, paddingTop: 13, textAlignVertical: 'top' }, hint: { fontSize: 12, lineHeight: 17 },
  section: { marginBottom: 34 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13 }, sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }, description: { marginTop: 3, fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 54, paddingHorizontal: 28 }, symbol: { fontSize: 44, marginBottom: 20 }, emptyTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 }, emptyBody: { textAlign: 'center', fontSize: 15, lineHeight: 22, marginBottom: 22 },
  pill: { borderWidth: 1, minHeight: 38, borderRadius: radius.pill, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', marginRight: 8 }, pillText: { fontSize: 13, fontWeight: '700', maxWidth: 150 },
});
