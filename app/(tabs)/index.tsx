import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { BrandIcon } from '@/components/BrandIcon';
import { Divider, EmptyState, PrimaryButton } from '@/components/UI';
import { createConversation } from '@/domain/factories';
import { useSalStore } from '@/state/store';
import { radius, space, useTheme } from '@/theme';

export default function ChatsScreen() {
  const theme = useTheme();
  const conversations = useSalStore((state) => state.conversations);
  const models = useSalStore((state) => state.models);
  const generations = useSalStore((state) => state.generations);
  const saveConversation = useSalStore((state) => state.saveConversation);
  const [creating, setCreating] = useState(false);

  const startChat = async () => {
    const model = models.filter((item) => item.enabled).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.sortOrder - b.sortOrder)[0];
    if (!model) { router.push('/(tabs)/models'); return; }
    setCreating(true);
    const conversation = createConversation(model.id);
    await saveConversation(conversation);
    setCreating(false);
    router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
  };

  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <Screen title="Sal Chat" eyebrow="Your conversations" action={<Pressable accessibilityLabel="Start a new chat" onPress={() => void startChat()} style={[styles.newIcon, { backgroundColor: theme.accent }]}><Ionicons name="add" size={24} color="#FFF" /></Pressable>}>
      {sorted.length === 0 ? (
        <EmptyState symbol="✦" title="A quiet place to think" body={models.length ? 'Choose a model and start a direct conversation. Your history stays on this device.' : 'Add your first provider and model, then Sal is ready to chat.'} action={<PrimaryButton loading={creating} onPress={() => void startChat()}>{models.length ? 'Start a conversation' : 'Add a model'}</PrimaryButton>} />
      ) : (
        <View style={[styles.list, { borderColor: theme.line, backgroundColor: theme.surface }]}>
          {sorted.map((conversation, index) => {
            const generation = generations.filter((item) => item.conversationId === conversation.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            const model = models.find((item) => item.id === conversation.selectedModelId);
            return (
              <View key={conversation.id}>
                <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}>
                  <BrandIcon icon={model?.icon ?? { type: 'emoji', value: '✦' }} size={44} />
                  <View style={styles.rowBody}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>{conversation.title}</Text>
                    <Text numberOfLines={1} style={[styles.meta, { color: theme.muted }]}>{generation?.provenance.modelName ?? model?.displayName ?? 'No model'} · {relativeTime(conversation.updatedAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </Pressable>
                {index < sorted.length - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function relativeTime(value: string): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const styles = StyleSheet.create({
  newIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' }, row: { minHeight: 76, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowBody: { flex: 1, gap: 4 }, rowTitle: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 },
});
