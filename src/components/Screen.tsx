import { forwardRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { FORM_MAX_WIDTH, useShellLayout } from '@/components/chat/useShellLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, space, useTheme } from '@/theme';

/** Form scroll view that stays usable while the keyboard is open. */
export const KeyboardScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScroll(
  { style, contentContainerStyle, keyboardShouldPersistTaps = 'handled', keyboardDismissMode = 'interactive', ...props },
  ref,
) {
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? undefined : 'padding'}>
      <ScrollView
        ref={ref}
        style={[styles.fill, style]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        {...props}
      />
    </KeyboardAvoidingView>
  );
});

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
  const { wide } = useShellLayout();
  const header = title || action || onBack ? (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
      ) : null}
      {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : <View style={styles.title} />}
      <View style={styles.action}>{action}</View>
    </View>
  ) : null;
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      {header}
      {scroll ? <KeyboardScroll contentContainerStyle={[styles.content, wide && styles.contentWide]}>{children}</KeyboardScroll> : <View style={styles.fill}>{children}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: space.xl, paddingBottom: 80 },
  contentWide: { width: '100%', maxWidth: FORM_MAX_WIDTH, alignSelf: 'center' },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.xl,
    paddingTop: 6,
    marginBottom: 14,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { flex: 1, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontFamily: font.bold },
  action: { minWidth: 32, alignItems: 'flex-end' },
});
