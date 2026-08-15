import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { Divider, EmptyState } from '@/components/UI';
import { useSalStore } from '@/state/store';
import { radius, space, useTheme } from '@/theme';

export default function AttachmentsScreen() {
  const theme = useTheme();
  const attachments = useSalStore((state) => state.attachments);
  const messages = useSalStore((state) => state.messages);
  const deleteAttachment = useSalStore((state) => state.deleteAttachment);
  const sorted = [...attachments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Screen title="Attachments" eyebrow="Local media library">
      {sorted.length === 0 ? <EmptyState symbol="⌁" title="Nothing stored yet" body="Images, audio, and video sent to models appear here once, even when reused across chats." /> : <View style={[styles.group, { borderColor: theme.line, backgroundColor: theme.surface }]}>{sorted.map((item, index) => {
        const refs = messages.filter((message) => message.parts.some((part) => part.type === 'attachment' && part.attachmentId === item.id)).length;
        return <View key={item.id}>{index ? <Divider /> : null}<View style={styles.row}>{item.modality === 'image' ? <Image source={{ uri: item.storedUri }} style={styles.preview} /> : <View style={[styles.preview, styles.iconPreview, { backgroundColor: theme.accentSoft }]}><Ionicons name={item.modality === 'audio' ? 'musical-notes' : 'videocam'} size={22} color={theme.accent} /></View>}<View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{item.originalName}</Text><Text style={[styles.meta, { color: theme.muted }]}>{formatBytes(item.byteSize)} · {refs} chat reference{refs === 1 ? '' : 's'}</Text><Text numberOfLines={1} style={[styles.hash, { color: theme.muted }]}>{item.sha256}</Text></View><View style={styles.actions}><Pressable accessibilityLabel="Share attachment" onPress={() => void Sharing.shareAsync(item.storedUri)}><Ionicons name="share-outline" size={21} color={theme.text} /></Pressable><Pressable accessibilityLabel="Delete attachment" onPress={() => refs ? Alert.alert('Attachment is still in use', `It is referenced by ${refs} message${refs === 1 ? '' : 's'}. Remove those references first.`) : Alert.alert('Delete attachment?', 'This removes the local file permanently.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteAttachment(item.id) }])}><Ionicons name="trash-outline" size={20} color={refs ? theme.muted : theme.danger} /></Pressable></View></View></View>;
      })}</View>}
    </Screen>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' }, row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md }, preview: { width: 62, height: 62, borderRadius: 14 }, iconPreview: { alignItems: 'center', justifyContent: 'center' }, name: { fontSize: 14, fontWeight: '700', marginBottom: 4 }, meta: { fontSize: 11 }, hash: { fontSize: 9, marginTop: 5, fontFamily: 'monospace' }, actions: { gap: 16, paddingHorizontal: 5 },
});
