import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MessageText } from '@/components/MessageText';
import { settingsActionLabel, type SettingsDestination } from '@/domain/configError';
import type { AttachmentBlob, Message, MessagePart } from '@/domain/types';
import { destinationForProviderError } from '@/network/errors';
import { useSalStore } from '@/state/store';
import { font, useTheme } from '@/theme';

export function MessageBubble({
  message,
  attachments,
  pinned = false,
  onTogglePin,
  onOpenSettings,
}: {
  message: Message;
  attachments: AttachmentBlob[];
  pinned?: boolean;
  onTogglePin?: () => void;
  onOpenSettings?: (destination: SettingsDestination) => void;
}) {
  const theme = useTheme();
  const settings = useSalStore((state) => state.settings);
  const generations = useSalStore((state) => state.generations);
  const [reasoningOpen, setReasoningOpen] = useState(settings.reasoningVisibility === 'expanded');
  const [showProvenance, setShowProvenance] = useState(false);
  const generation = generations.find((item) => item.messageId === message.id);
  const user = message.role === 'user';
  const text = message.parts.filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('');
  const reasoning = message.parts.filter((part): part is Extract<MessagePart, { type: 'reasoning' }> => part.type === 'reasoning').map((part) => part.text).join('');
  const files = message.parts.filter((part): part is Extract<MessagePart, { type: 'attachment' }> => part.type === 'attachment');

  const destination =
    !user && generation?.errorCode
      ? destinationForProviderError(generation.errorCode, {
          modelId: generation.provenance.modelId,
          providerId: generation.provenance.providerId,
        })
      : null;

  const reveal = () => {
    Alert.alert(user ? 'Message' : 'Response', undefined, [
      { text: 'Copy', onPress: () => void Clipboard.setStringAsync(text) },
      ...(onTogglePin ? [{ text: pinned ? 'Unpin from context' : 'Pin to context', onPress: onTogglePin }] : []),
      ...(!user && generation ? [{ text: showProvenance ? 'Hide details' : 'Show details', onPress: () => setShowProvenance((value) => !value) }] : []),
      ...(destination && onOpenSettings
        ? [{ text: settingsActionLabel(destination), onPress: () => onOpenSettings(destination) }]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable onLongPress={reveal} style={[styles.message, user && styles.userMessage]}>
      {pinned ? (
        <View style={[styles.pin, user && styles.userPin]}>
          <Ionicons name="pin" color={theme.accent} size={11} />
          <Text style={[styles.pinText, { color: theme.accent }]}>Pinned to context</Text>
        </View>
      ) : null}
      {files.length ? (
        <View style={[styles.files, user && styles.userFiles]}>
          {files.map((file) => {
            const blob = attachments.find((item) => item.id === file.attachmentId);
            if (blob?.modality === 'image') {
              return <Image key={file.attachmentId} source={{ uri: blob.storedUri }} style={styles.image} />;
            }
            return (
              <View key={file.attachmentId} style={[styles.inlineFile, { backgroundColor: theme.surface }]}>
                <Ionicons name="attach" color={theme.muted} size={14} />
                <Text numberOfLines={1} style={[styles.inlineFileText, { color: theme.muted }]}>{file.name}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {reasoning && settings.reasoningVisibility !== 'hidden' ? (
        <Pressable onPress={() => setReasoningOpen((value) => !value)} style={styles.reasoning}>
          <View style={styles.reasoningHead}>
            <Ionicons name="sparkles-outline" size={14} color={theme.muted} />
            <Text style={[styles.reasoningLabel, { color: theme.muted }]}>Reasoning</Text>
            <Ionicons name={reasoningOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.muted} />
          </View>
          {reasoningOpen ? <Text style={[styles.reasoningText, { color: theme.muted }]}>{reasoning}</Text> : null}
        </Pressable>
      ) : null}
      {text ? (
        user ? (
          <View style={[styles.userBubble, { backgroundColor: theme.accentSoft }]}>
            <MessageText tone="user">{text}</MessageText>
          </View>
        ) : (
          <MessageText tone="assistant">{text}</MessageText>
        )
      ) : null}
      {!user && showProvenance && generation ? (
        <Text style={[styles.provenance, { color: theme.muted }]}>
          {generation.provenance.modelName}
          {generation.provenance.credentialName ? ` · ${generation.provenance.credentialName}` : ''}
          {generation.totalTokens ? ` · ${generation.totalTokens} tokens` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  message: { maxWidth: '94%', alignSelf: 'flex-start' },
  userMessage: { alignSelf: 'flex-end', maxWidth: '82%' },
  userBubble: { borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  userPin: { justifyContent: 'flex-end' },
  pinText: { fontSize: 10, fontFamily: font.semibold },
  provenance: { fontSize: 11, marginTop: 8, fontFamily: font.regular },
  reasoning: { marginBottom: 10 },
  reasoningHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasoningLabel: { fontSize: 13, fontFamily: font.semibold, flex: 1 },
  reasoningText: { fontSize: 13, lineHeight: 19, marginTop: 8, fontFamily: font.regular },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  userFiles: { justifyContent: 'flex-end' },
  image: { width: 168, height: 168, borderRadius: 16 },
  inlineFile: { borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 180 },
  inlineFileText: { fontSize: 12, flexShrink: 1, fontFamily: font.regular },
});
