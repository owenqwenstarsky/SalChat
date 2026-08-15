import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AttachSourceMenu, type AttachSource } from '@/components/chat/AttachSourceMenu';
import type { AttachmentBlob } from '@/domain/types';
import { font, useTheme } from '@/theme';

export function Composer({
  text,
  onChangeText,
  placeholder,
  pending,
  attachments,
  canSend,
  sending,
  canAttach,
  attachMenuOpen,
  allowCamera,
  allowLibrary,
  allowFiles,
  includeImages,
  includeVideos,
  onAttach,
  onAttachSource,
  onRemoveAttachment,
  onSend,
  onStop,
  onDropFiles,
}: {
  text: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  pending: string[];
  attachments: AttachmentBlob[];
  canSend: boolean;
  sending: boolean;
  canAttach: boolean;
  attachMenuOpen: boolean;
  allowCamera: boolean;
  allowLibrary: boolean;
  allowFiles: boolean;
  includeImages: boolean;
  includeVideos: boolean;
  onAttach: () => void;
  onAttachSource: (source: AttachSource) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  onDropFiles?: (files: { uri: string; name: string; mimeType: string; size?: number }[]) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={styles.wrap}
      {...(Platform.OS === 'web' && onDropFiles
        ? {
            onDragOver: (event: { preventDefault: () => void }) => event.preventDefault(),
            onDrop: (event: { preventDefault: () => void; dataTransfer?: { files: FileList } }) => {
              event.preventDefault();
              const dropped = Array.from(event.dataTransfer?.files ?? []);
              if (!dropped.length) return;
              onDropFiles(dropped.map((file) => ({
                uri: URL.createObjectURL(file),
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
              })));
            },
          }
        : {})}
    >
      {pending.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pending} contentContainerStyle={styles.pendingRow}>
          {pending.map((attachmentId) => {
            const item = attachments.find((blob) => blob.id === attachmentId);
            if (!item) return null;
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={`Remove ${item.originalName}`}
                onPress={() => onRemoveAttachment(item.id)}
                style={[styles.chip, { backgroundColor: theme.surface }]}
              >
                {item.modality === 'image' ? (
                  <Image source={{ uri: item.storedUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.fileIcon, { backgroundColor: theme.well }]}>
                    <Ionicons name={item.modality === 'audio' ? 'musical-notes-outline' : 'videocam-outline'} size={14} color={theme.muted} />
                  </View>
                )}
                <Text numberOfLines={1} style={[styles.fileName, { color: theme.text }]}>{item.originalName}</Text>
                <Ionicons name="close" size={14} color={theme.muted} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {attachMenuOpen ? (
        <AttachSourceMenu
          allowCamera={allowCamera}
          allowLibrary={allowLibrary}
          allowFiles={allowFiles}
          includeImages={includeImages}
          includeVideos={includeVideos}
          onChoose={onAttachSource}
        />
      ) : null}
      <View style={[styles.pill, { backgroundColor: theme.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={attachMenuOpen ? 'Close attachment options' : 'Add attachment'}
          accessibilityHint={attachMenuOpen || !allowLibrary || !allowFiles ? undefined : allowCamera ? 'Choose camera, photo library, or files' : 'Choose photo library or files'}
          disabled={!canAttach}
          onPress={onAttach}
          style={styles.side}
        >
          <Ionicons name={attachMenuOpen ? 'close' : 'add'} size={24} color={canAttach ? theme.text : theme.line} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          multiline
          blurOnSubmit={false}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          onKeyPress={(event) => {
            const native = event.nativeEvent as { key: string; shiftKey?: boolean };
            if (native.key !== 'Enter' || native.shiftKey) return;
            event.preventDefault();
            if (canSend && !sending) onSend();
          }}
          style={[styles.input, { color: theme.text }]}
        />
        {sending ? (
          <Pressable accessibilityLabel="Stop response" onPress={onStop} style={[styles.send, { backgroundColor: theme.text }]}>
            <Ionicons name="stop" size={14} color={theme.background} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Send message"
            disabled={!canSend}
            onPress={onSend}
            style={[styles.send, { backgroundColor: canSend ? theme.accent : theme.line }]}
          >
            <Ionicons name="arrow-up" size={18} color="#FFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6 },
  pending: { marginBottom: 8, marginHorizontal: 4 },
  pendingRow: { gap: 8, paddingRight: 8 },
  chip: { maxWidth: 180, height: 36, borderRadius: 12, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  thumb: { width: 36, height: 36, borderRadius: 12 },
  fileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName: { flexShrink: 1, fontSize: 12, fontFamily: font.semibold, maxWidth: 96 },
  pill: { minHeight: 48, borderRadius: 24, paddingLeft: 4, paddingRight: 6, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-end' },
  side: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 36, maxHeight: 140, paddingTop: 8, paddingBottom: 8, fontSize: 16, lineHeight: 22, fontFamily: font.regular, textAlignVertical: 'center' },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
