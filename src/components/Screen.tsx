import type { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { space, useTheme } from '@/theme';

export function Screen({ children, scroll = true, title, eyebrow, action }: PropsWithChildren<{ scroll?: boolean; title?: string; eyebrow?: string; action?: ReactNode }>) {
  const theme = useTheme();
  const content = (
    <>
      {(title || eyebrow || action) && (
        <View style={styles.header}>
          <View style={styles.heading}>
            {eyebrow ? <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow.toUpperCase()}</Text> : null}
            {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
          </View>
          {action}
        </View>
      )}
      {children}
    </>
  );
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{content}</ScrollView> : <View style={styles.fill}>{content}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, fill: { flex: 1 }, content: { paddingHorizontal: space.xl, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 18, marginBottom: 26 },
  heading: { flex: 1 }, eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', marginBottom: 5 },
  title: { fontSize: 34, lineHeight: 39, letterSpacing: -1.2, fontWeight: '800' },
});
