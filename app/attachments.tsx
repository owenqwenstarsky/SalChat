import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { alertDialog } from '@/components/Dialogs';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/Screen';
import { Divider, EmptyState, Group } from '@/components/UI';
import { useSalStore } from '@/state/store';
import { font, space, useTheme } from '@/theme';

export default function AttachmentsScreen() {
  const theme = useTheme();
  const attachments = useSalStore((state) => state.attachments);
  const messages = useSalStore((state) => state.messages);
  const deleteAttachment = useSalStore((state) => state.deleteAttachment);
  const sorted = [...attachments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Screen title="Attachments" onBack={() => router.back()}>
      {sorted.length === 0 ? (
        <EmptyState title="Nothing stored yet" body="Images, audio, and video sent to models appear here once, even when reused across chats." />
      ) : (
        <Group>
          {sorted.map((item, index) => {
            const refs = messages.filter((message) => message.parts.some((part) => part.type === 'attachment' && part.attachmentId === item.id)).length;
            return (
              <View key={item.id}>
                {index ? <Divider /> : null}
                <View style={styles.row}>
                  {item.modality === 'image' ? (
                    <Image source={{ uri: item.storedUri }} style={styles.preview} />
                  ) : (
                    <View style={[styles.preview, styles.iconPreview, { backgroundColor: theme.well }]}>
                      <Ionicons name={item.modality === 'audio' ? 'musical-notes' : 'videocam'} size={20} color={theme.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{item.originalName}</Text>
                    <Text style={[styles.meta, { color: theme.muted }]}>
                      {formatBytes(item.byteSize)} · {refs} chat reference{refs === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <Pressable accessibilityLabel="Share attachment" onPress={() => void shareAttachment(item.storedUri, item.originalName)}>
                      <Ionicons name="share-outline" size={20} color={theme.text} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Delete attachment"
                      onPress={() =>
                        refs
                          ? alertDialog('Attachment is still in use', `It is referenced by ${refs} message${refs === 1 ? '' : 's'}. Remove those references first.`)
                          : alertDialog('Delete attachment?', 'This removes the local file permanently.', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => void deleteAttachment(item.id) },
                            ])
                      }
                    >
                      <Ionicons name="trash-outline" size={20} color={refs ? theme.muted : theme.danger} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </Group>
      )}
    </Screen>
  );
}

function shareAttachment(uri: string, name: string): void {
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = uri;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  void Sharing.shareAsync(uri);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  row: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md },
  preview: { width: 52, height: 52, borderRadius: 12 },
  iconPreview: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontFamily: font.semibold, marginBottom: 3 },
  meta: { fontSize: 12, fontFamily: font.regular },
  actions: { flexDirection: 'row', gap: 14, paddingHorizontal: 4 },
});
