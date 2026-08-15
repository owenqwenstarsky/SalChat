import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { font, radius, useTheme } from '@/theme';

export type DialogAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

interface DialogState {
  title: string;
  message?: string;
  actions: DialogAction[];
}

const useDialogStore = create<{
  current: DialogState | null;
  show: (next: DialogState) => void;
  hide: () => void;
}>((set) => ({
  current: null,
  show: (next) => set({ current: next }),
  hide: () => set({ current: null }),
}));

export function alertDialog(title: string, message?: string, actions: DialogAction[] = [{ text: 'OK' }]): void {
  useDialogStore.getState().show({
    title,
    ...(message ? { message } : {}),
    actions: actions.length ? actions : [{ text: 'OK' }],
  });
}

export function confirmDialog(
  title: string,
  message: string,
  options?: { confirmText?: string; cancelText?: string; destructive?: boolean },
): Promise<boolean> {
  return new Promise((resolve) => {
    alertDialog(title, message, [
      { text: options?.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: options?.confirmText ?? 'Continue',
        style: options?.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function DialogHost() {
  const theme = useTheme();
  const current = useDialogStore((state) => state.current);
  const hide = useDialogStore((state) => state.hide);
  if (!current) return null;

  const close = (action?: DialogAction) => {
    hide();
    action?.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(current.actions.find((item) => item.style === 'cancel'))}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={() => close(current.actions.find((item) => item.style === 'cancel'))}>
        <Pressable style={[styles.card, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <Text style={[styles.title, { color: theme.text }]}>{current.title}</Text>
          {current.message ? <Text style={[styles.message, { color: theme.muted }]}>{current.message}</Text> : null}
          <View style={[styles.actions, current.actions.length > 2 && styles.actionsStack]}>
            {current.actions.map((action) => {
              const color = action.style === 'destructive' ? theme.danger : action.style === 'cancel' ? theme.muted : theme.accent;
              return (
                <Pressable
                  key={action.text}
                  accessibilityRole="button"
                  onPress={() => close(action)}
                  style={[styles.action, current.actions.length > 2 && styles.actionFull]}
                >
                  <Text style={[styles.actionText, { color }]}>{action.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: 18 },
  title: { fontSize: 17, fontFamily: font.semibold },
  message: { fontSize: 14, lineHeight: 20, fontFamily: font.regular, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 16, marginTop: 18 },
  actionsStack: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  action: { minHeight: 36, justifyContent: 'center' },
  actionFull: { minHeight: 40 },
  actionText: { fontSize: 15, fontFamily: font.semibold, textAlign: 'right' },
});
