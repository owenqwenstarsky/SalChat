import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Composer } from '@/components/chat/Composer';
import { HistoryDrawer } from '@/components/chat/HistoryDrawer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { sendMessage, stopGeneration } from '@/chat/engine';
import { ConfigurationError, settingsActionLabel, settingsHref, type SettingsDestination } from '@/domain/configError';
import { createConversation, createId } from '@/domain/factories';
import { latestConversationWithMessages, preferredModel, unusedEmptyConversations } from '@/domain/conversations';
import type { Message, Model } from '@/domain/types';
import { importAttachment } from '@/storage/attachments';
import { useSalStore } from '@/state/store';
import { font, useTheme } from '@/theme';

export function ChatScreen({ conversationId }: { conversationId: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message>>(null);
  const conversations = useSalStore((state) => state.conversations);
  const allMessages = useSalStore((state) => state.messages);
  const allModels = useSalStore((state) => state.models);
  const providers = useSalStore((state) => state.providers);
  const credentials = useSalStore((state) => state.credentials);
  const attachments = useSalStore((state) => state.attachments);
  const settings = useSalStore((state) => state.settings);
  const saveConversation = useSalStore((state) => state.saveConversation);
  const saveMessage = useSalStore((state) => state.saveMessage);
  const saveAttachment = useSalStore((state) => state.saveAttachment);
  const deleteConversation = useSalStore((state) => state.deleteConversation);
  const conversation = conversations.find((item) => item.id === conversationId) ?? null;
  const messages = useMemo(
    () => allMessages.filter((item) => item.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allMessages, conversationId],
  );
  const models = useMemo(() => allModels.filter((item) => item.enabled), [allModels]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pickedModelId, setPickedModelId] = useState<string | null>(null);
  const [pickedCredentialId, setPickedCredentialId] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages]);

  const model = models.find((item) => item.id === (conversation?.selectedModelId ?? pickedModelId)) ?? preferredModel(models);
  const provider = providers.find((item) => item.id === model?.providerId) ?? null;
  const providerAccounts = credentials.filter((item) => item.providerId === provider?.id);
  const selectedCredential =
    providerAccounts.find((item) => item.id === (conversation?.selectedCredentialId ?? pickedCredentialId)) ??
    providerAccounts.find((item) => item.id === provider?.lastCredentialId) ??
    providerAccounts[0] ??
    null;

  const persistConversation = async (nextModel = model) => {
    if (conversation) return conversation;
    const nextProvider = providers.find((item) => item.id === nextModel?.providerId);
    const created = {
      ...createConversation(nextModel?.id ?? null),
      selectedCredentialId: selectedCredential?.id ?? nextProvider?.lastCredentialId ?? null,
    };
    await saveConversation(created);
    return created;
  };

  const chooseModel = async (next: Model) => {
    const incompatible = incompatibleAttachments(next, messages, attachments);
    if (incompatible.length) {
      Alert.alert('This history contains unsupported media', `${next.displayName} is not configured for ${incompatible.join(', ')} input.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Configure model', onPress: () => openSettings({ kind: 'model', modelId: next.id, focus: 'capabilities' }) },
        { text: 'Fork text-only', onPress: () => void forkTextOnly(next) },
      ]);
      return;
    }
    const nextProvider = providers.find((item) => item.id === next.providerId);
    if (conversation) {
      await saveConversation({
        ...conversation,
        selectedModelId: next.id,
        selectedCredentialId: nextProvider?.lastCredentialId ?? null,
        updatedAt: new Date().toISOString(),
      });
    } else {
      setPickedModelId(next.id);
      setPickedCredentialId(nextProvider?.lastCredentialId ?? null);
    }
    setShowModels(false);
  };

  const forkTextOnly = async (next: Model) => {
    const nextProvider = providers.find((item) => item.id === next.providerId);
    const fork = { ...createConversation(next.id), title: `${conversation?.title ?? 'Chat'} · text fork`, selectedCredentialId: nextProvider?.lastCredentialId ?? null, systemPrompt: conversation?.systemPrompt ?? '' };
    await saveConversation(fork);
    for (const message of messages) {
      const parts = message.parts.filter((part) => part.type === 'text').map((part) => ({ ...part }));
      if (!parts.length) continue;
      const copy: Message = { ...message, id: createId(), conversationId: fork.id, parts, status: 'complete', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveMessage(copy);
    }
    setShowModels(false);
    router.replace({ pathname: '/chat/[id]', params: { id: fork.id } });
  };

  const chooseAccount = async (credentialId: string) => {
    if (conversation) {
      await saveConversation({ ...conversation, selectedCredentialId: credentialId, updatedAt: new Date().toISOString() });
      return;
    }
    setPickedCredentialId(credentialId);
  };

  const pickAttachment = async () => {
    if (!model) return;
    const types = [
      ...(model.capabilities.image.value ? model.limits.imageMimeTypes.value : []),
      ...(model.capabilities.audio.value ? model.limits.audioMimeTypes.value : []),
      ...(model.capabilities.video.value ? model.limits.videoMimeTypes.value : []),
    ];
    if (!types.length) {
      alertWithSettings(
        'This model does not have attachment support enabled.',
        'Turn on image, audio, or video input in this model’s settings.',
        { kind: 'model', modelId: model.id, focus: 'capabilities' },
      );
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: types.length ? types : '*/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    if (!useSalStore.getState().db) return;
    const imported: string[] = [];
    for (const asset of result.assets) {
      try {
        const blob = await importAttachment(useSalStore.getState().db!, {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          ...(asset.size !== undefined ? { size: asset.size } : {}),
        });
        await saveAttachment(blob);
        imported.push(blob.id);
      } catch (error) {
        Alert.alert('Could not attach file', error instanceof Error ? error.message : String(error));
      }
    }
    setPending((current) => [...new Set([...current, ...imported])]);
  };

  const startNewChat = async () => {
    const leftovers = unusedEmptyConversations(conversations, allMessages, conversation?.id);
    await Promise.all(leftovers.map((item) => deleteConversation(item.id)));
    if (conversation && !messages.length) {
      setShowHistory(false);
      return;
    }
    if (!model) {
      setShowHistory(false);
      router.push('/models');
      return;
    }
    const next = createConversation(model.id);
    await saveConversation({ ...next, selectedCredentialId: selectedCredential?.id ?? null });
    setShowHistory(false);
    setText('');
    setPending([]);
    router.replace({ pathname: '/chat/[id]', params: { id: next.id } });
  };

  const submit = async () => {
    if ((!text.trim() && !pending.length) || !model || sending) return;
    const outgoing = text;
    const outgoingAttachments = pending;
    setText('');
    setPending([]);
    setSending(true);
    if (settings.hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const target = await persistConversation(model);
      if (target.id !== conversationId) router.replace({ pathname: '/chat/[id]', params: { id: target.id } });
      await sendMessage({ conversationId: target.id, text: outgoing, attachmentIds: outgoingAttachments });
    } catch (error) {
      setText(outgoing);
      setPending(outgoingAttachments);
      if (error instanceof ConfigurationError) {
        alertWithSettings('Cannot send', error.message, error.destination);
      } else {
        Alert.alert('Cannot send', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSending(false);
    }
  };

  const openRoute = (href: '/models' | '/attachments' | '/settings') => {
    setShowHistory(false);
    setShowModels(false);
    router.push(href);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Open chat history" onPress={() => setShowHistory(true)} style={styles.headerButton}>
          <Ionicons name="menu-outline" size={24} color={theme.text} />
        </Pressable>
        <Pressable style={styles.titleWrap} onPress={() => setShowModels(true)}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{model?.displayName ?? 'Choose a model'}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.muted} />
        </Pressable>
        <Pressable accessibilityLabel="Start a new chat" onPress={() => void startNewChat()} style={styles.headerButton}>
          <Ionicons name="create-outline" size={22} color={theme.text} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.messages, !messages.length && styles.center]}
          renderItem={({ item }) => <MessageBubble message={item} attachments={attachments} onOpenSettings={openSettings} />}
          ListEmptyComponent={
            <View style={styles.welcome}>
              <Text style={[styles.welcomeTitle, { color: theme.text }]}>{model ? 'Ready when you are.' : 'Add a provider to start.'}</Text>
              <Text style={[styles.welcomeBody, { color: theme.muted }]}>
                {model ? `Messages go directly to ${provider?.displayName ?? model.displayName}.` : 'Connect OpenAI, Ollama, or llama.cpp. History stays on this device.'}
              </Text>
              {!model ? (
                <Pressable onPress={() => router.push('/models')} style={[styles.setup, { backgroundColor: theme.accent }]}>
                  <Text style={styles.setupText}>Add a provider</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
        <View style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
          <Composer
            text={text}
            onChangeText={setText}
            placeholder={model ? `Message ${model.displayName}` : 'Choose a model'}
            pending={pending}
            attachments={attachments}
            canSend={Boolean(model && (text.trim() || pending.length))}
            sending={sending}
            canAttach={Boolean(model)}
            onAttach={() => void pickAttachment()}
            onRemoveAttachment={(id) => setPending((current) => current.filter((item) => item !== id))}
            onSend={() => void submit()}
            onStop={() => conversation && stopGeneration(conversation.id)}
          />
        </View>
      </KeyboardAvoidingView>
      <ModelPicker
        visible={showModels}
        models={models}
        providers={providers}
        selectedModelId={model?.id ?? null}
        accounts={providerAccounts}
        selectedCredentialId={selectedCredential?.id ?? null}
        onClose={() => setShowModels(false)}
        onChooseModel={(item) => void chooseModel(item)}
        onChooseAccount={(id) => void chooseAccount(id)}
        onManage={() => openRoute('/models')}
      />
      <HistoryDrawer
        visible={showHistory}
        conversations={conversations}
        messages={allMessages}
        currentId={conversationId}
        onClose={() => setShowHistory(false)}
        onSelect={(id) => {
          setShowHistory(false);
          if (id !== conversationId) router.replace({ pathname: '/chat/[id]', params: { id } });
        }}
        onNewChat={() => void startNewChat()}
        onRename={(id, title) => {
          const target = conversations.find((item) => item.id === id);
          if (target) void saveConversation({ ...target, title, updatedAt: new Date().toISOString() });
        }}
        onDelete={(id) => {
          void deleteConversation(id).then(() => {
            if (id === conversationId) {
              const next = latestConversationWithMessages(
                conversations.filter((item) => item.id !== id),
                allMessages.filter((item) => item.conversationId !== id),
              );
              router.replace(next ? { pathname: '/chat/[id]', params: { id: next.id } } : '/');
            }
          });
        }}
        onOpenModels={() => openRoute('/models')}
        onOpenAttachments={() => openRoute('/attachments')}
        onOpenSettings={() => openRoute('/settings')}
      />
    </SafeAreaView>
  );
}

function openSettings(destination: SettingsDestination): void {
  router.push(settingsHref(destination));
}

function alertWithSettings(title: string, message: string, destination: SettingsDestination): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: settingsActionLabel(destination), onPress: () => openSettings(destination) },
  ]);
}

function incompatibleAttachments(
  model: Model,
  messages: Message[],
  attachments: ReturnType<typeof useSalStore.getState>['attachments'],
): string[] {
  const ids = messages.flatMap((message) => message.parts.filter((part) => part.type === 'attachment').map((part) => part.attachmentId));
  const modalities = new Set(ids.map((id) => attachments.find((item) => item.id === id)?.modality).filter(Boolean));
  return [...modalities].filter((modality) => modality && !model.capabilities[modality].value) as string[];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  title: { fontSize: 16, fontFamily: font.semibold, maxWidth: '80%' },
  messages: { paddingHorizontal: 18, paddingVertical: 20, gap: 22 },
  center: { flexGrow: 1, justifyContent: 'center' },
  welcome: { alignItems: 'center', paddingHorizontal: 36 },
  welcomeTitle: { fontSize: 26, fontFamily: font.bold, letterSpacing: -0.6, textAlign: 'center' },
  welcomeBody: { fontSize: 15, textAlign: 'center', lineHeight: 21, marginTop: 8, fontFamily: font.regular },
  setup: { marginTop: 22, minHeight: 44, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  setupText: { color: '#FFF', fontSize: 15, fontFamily: font.semibold },
});
