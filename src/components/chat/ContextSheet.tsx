import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GhostButton, Pill, PrimaryButton } from '@/components/UI';
import type { ContextBudget } from '@/chat/context';
import type { ContextMode, Conversation } from '@/domain/types';
import { font, radius, space, useTheme } from '@/theme';

export function ContextSheet({
  visible,
  conversation,
  budget,
  defaultMode,
  busy,
  onClose,
  onSave,
  onCompact,
  onRebuild,
  onStop,
}: {
  visible: boolean;
  conversation: Conversation;
  budget: ContextBudget;
  defaultMode: 'automatic' | 'manual';
  busy: boolean;
  onClose: () => void;
  onSave: (mode: ContextMode, note: string) => void;
  onCompact: (mode: ContextMode, note: string) => void;
  onRebuild: (mode: ContextMode, note: string) => void;
  onStop: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ContextMode>(conversation.context.mode);
  const [note, setNote] = useState(conversation.context.note);
  useEffect(() => {
    if (!visible) return;
    setMode(conversation.context.mode);
    setNote(conversation.context.note);
  }, [conversation.context.mode, conversation.context.note, visible]);
  const checkpoint = conversation.context.checkpoint;
  const dirty = mode !== conversation.context.mode || note !== conversation.context.note;
  const percent = budget.utilization === null ? null : Math.max(0, Math.round(budget.utilization * 100));

  const done = () => {
    if (dirty) onSave(mode, note);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={done}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Close context" style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={done} />
        <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: theme.line }]} />
          <View style={styles.heading}>
            <View style={[styles.headingIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="layers-outline" size={18} color={theme.accent} />
            </View>
            <View style={styles.headingBody}>
              <Text style={[styles.title, { color: theme.text }]}>Conversation context</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>Full history stays on this device.</Text>
            </View>
            <Pressable accessibilityLabel="Close" hitSlop={8} onPress={done}>
              <Ionicons name="close" size={22} color={theme.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.meterCard, { backgroundColor: theme.surface }]}>
              <View style={styles.meterHead}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Estimated request context</Text>
                <Text style={[styles.meterValue, { color: budget.overBudget ? theme.danger : theme.accent }]}>
                  {percent === null ? 'Unknown window' : `${percent}%`}
                </Text>
              </View>
              {percent !== null ? (
                <View style={[styles.track, { backgroundColor: theme.well }]}>
                  <View style={[styles.fill, { width: `${Math.min(percent, 100)}%`, backgroundColor: budget.overBudget ? theme.danger : theme.accent }]} />
                </View>
              ) : null}
              <Text style={[styles.meta, { color: theme.muted }]}>
                {budget.contextWindow === null
                  ? `${budget.estimatedTokens.toLocaleString()} estimated tokens · Sal will recover reactively if the provider reports overflow.`
                  : `${budget.estimatedTokens.toLocaleString()} estimated · ${budget.inputCeiling?.toLocaleString()} automatic-compaction ceiling · ${budget.contextWindow.toLocaleString()} model window`}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Automatic compaction</Text>
              <View style={styles.pills}>
                {(['inherit', 'automatic', 'manual'] as const).map((value) => (
                  <Pill key={value} active={mode === value} onPress={() => setMode(value)}>
                    {value === 'inherit' ? `Default · ${defaultMode}` : value === 'automatic' ? 'Automatic' : 'Manual only'}
                  </Pill>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.labelRow}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Pinned chat note</Text>
                <Text style={[styles.count, { color: theme.muted }]}>{conversation.context.pinnedMessageIds.length} pinned messages</Text>
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Goals, constraints, names, or facts that should survive every compaction"
                placeholderTextColor={theme.muted}
                style={[styles.note, { color: theme.text, backgroundColor: theme.surface }]}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.labelRow}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Rolling checkpoint</Text>
                {checkpoint ? <Text style={[styles.count, { color: theme.muted }]}>Revision {checkpoint.revision}</Text> : null}
              </View>
              {checkpoint ? (
                <View style={[styles.summary, { backgroundColor: theme.surface }]}>
                  <Text selectable style={[styles.summaryText, { color: theme.text }]}>{checkpoint.summary}</Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>
                    {checkpoint.provenance.modelName} · {checkpoint.sourceMessageCount} messages · {checkpoint.totalTokens?.toLocaleString() ?? 'unreported'} tokens
                  </Text>
                </View>
              ) : (
                <View style={[styles.emptySummary, { borderColor: theme.line }]}>
                  <Text style={[styles.emptyText, { color: theme.muted }]}>No checkpoint yet. Recent conversations continue using full history.</Text>
                </View>
              )}
            </View>

            <View style={styles.actions}>
              {busy ? <GhostButton onPress={onStop}>Stop compaction</GhostButton> : <PrimaryButton onPress={() => onCompact(mode, note)}>Compact now</PrimaryButton>}
              {checkpoint && !busy ? <GhostButton onPress={() => onRebuild(mode, note)}>Rebuild summary</GhostButton> : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { zIndex: 1, elevation: 1, maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 12 },
  heading: { paddingHorizontal: space.xl, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingBody: { flex: 1 },
  title: { fontSize: 19, fontFamily: font.bold, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  scroll: { paddingHorizontal: space.xl },
  content: { paddingBottom: space.xl },
  meterCard: { borderRadius: radius.lg, padding: 16, marginBottom: 22 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  meterValue: { fontSize: 13, fontFamily: font.bold },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  fill: { height: 6, borderRadius: 3 },
  meta: { fontSize: 11, lineHeight: 16, fontFamily: font.regular, marginTop: 10 },
  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 14, fontFamily: font.semibold },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 },
  count: { fontSize: 11, fontFamily: font.regular },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  note: { minHeight: 112, borderRadius: radius.md, padding: 14, fontSize: 15, lineHeight: 21, fontFamily: font.regular, textAlignVertical: 'top' },
  summary: { borderRadius: radius.md, padding: 14 },
  summaryText: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  emptySummary: { minHeight: 84, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 16 },
  emptyText: { fontSize: 13, lineHeight: 18, fontFamily: font.regular, textAlign: 'center' },
  actions: { gap: 10 },
});
