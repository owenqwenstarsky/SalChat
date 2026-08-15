import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, space, useTheme } from '@/theme';

export function Screen({
  children,
  scroll = true,
  title,
  action,
  onBack,
}: PropsWithChildren<{
  scroll?: boolean;
  title?: string;
  action?: ReactNode;
  onBack?: () => void;
}>) {
  const theme = useTheme();
  const content = (
    <>
      {(title || action || onBack) && (
        <View style={styles.header}>
          {onBack ? (
            <Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.back}>
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </Pressable>
          ) : null}
          {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : <View style={styles.title} />}
          <View style={styles.action}>{action}</View>
        </View>
      )}
      {children}
    </>
  );
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: { paddingHorizontal: space.xl, paddingBottom: 80 },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    marginBottom: 22,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { flex: 1, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontFamily: font.bold },
  action: { minWidth: 32, alignItems: 'flex-end' },
});
