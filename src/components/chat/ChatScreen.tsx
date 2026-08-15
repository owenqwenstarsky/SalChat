import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import type { AttachSource } from '@/components/chat/AttachSourceMenu';
import { Composer } from '@/components/chat/Composer';
import { HistoryDrawer } from '@/components/chat/HistoryDrawer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { sendMessage, stopGeneration } from '@/chat/engine';
import { ConfigurationError, settingsActionLabel, settingsHref, type SettingsDestination } from '@/domain/configError';
import { createConversation, createId } from '@/domain/factories';
import { latestConversationWithMessages, preferredModel, unusedEmptyConversations } from '@/domain/conversations';
import { composerPlaceholder, modelLabel } from '@/domain/labels';
import type { Message, Model } from '@/domain/types';
import { importAttachment } from '@/storage/attachments';
import { useSalStore } from '@/state/store';
import { font, useTheme } from '@/theme';

const HEADER_HEIGHT = 52;
const NEAR_BOTTOM = 80;
const COMPOSER_KEYBOARD_GAP = 8;

function useComposerBottomInset(restingInset: number) {
  const [keyboardHeight, setKeyboardHeight] = useState(() =>
    Platform.OS === 'ios' ? (Keyboard.metrics()?.height ?? 0) : 0,
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    const animate = (duration?: number) => {
      if (!duration) return;
      LayoutAnimation.configureNext({
        duration: Math.max(duration, 10),
        update: { duration: Math.max(duration, 10), type: LayoutAnimation.Types.keyboard },
      });
    };

    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      animate(event.duration);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (event) => {
      animate(event.duration);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardHeight > 0 ? keyboardHeight + COMPOSER_KEYBOARD_GAP : Math.max(restingInset, 10);
}

export function ChatScreen({ conversationId }: { conversationId: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const composerBottom = useComposerBottomInset(insets.bottom);
  const listRef = useRef<FlatList<Message>>(null);
  const pinnedToBottomRef = useRef(true);
  const lastOffsetRef = useRef(0);
  const ignoreScrollRef = useRef(false);
  const conversationKeyRef = useRef(conversationId);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pickedModelId, setPickedModelId] = useState<string | null>(null);
  const [pickedCredentialId, setPickedCredentialId] = useState<string | null>(null);

  if (conversationKeyRef.current !== conversationId) {
    conversationKeyRef.current = conversationId;
    pinnedToBottomRef.current = true;
    lastOffsetRef.current = 0;
    if (showJumpToLatest) setShowJumpToLatest(false);
    if (showAttachMenu) setShowAttachMenu(false);
  }

  const streaming = messages[messages.length - 1]?.status === 'streaming';

  const setPinned = (pinned: boolean) => {
    pinnedToBottomRef.current = pinned;
    const next = Boolean(!pinned && messages.length);
    setShowJumpToLatest((current) => (current === next ? current : next));
  };

  const scrollToLatest = (animated: boolean, contentHeight?: number) => {
    ignoreScrollRef.current = true;
    if (typeof contentHeight === 'number') {
      listRef.current?.scrollToOffset({ offset: contentHeight, animated });
    } else {
      listRef.current?.scrollToEnd({ animated });
    }
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
      if (pinnedToBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
    });
  };

  const followIfPinned = (contentHeight?: number) => {
    if (!pinnedToBottomRef.current || !messages.length) return;
    scrollToLatest(!streaming, contentHeight);
  };

  const syncPinnedFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (ignoreScrollRef.current) {
      lastOffsetRef.current = contentOffset.y;
      return;
    }
    if (pinnedToBottomRef.current && distance > NEAR_BOTTOM && contentOffset.y >= lastOffsetRef.current - 1) {
      lastOffsetRef.current = contentOffset.y;
      scrollToLatest(false, contentSize.height);
      return;
    }
    lastOffsetRef.current = contentOffset.y;
    setPinned(distance <= NEAR_BOTTOM);
  };

  const jumpToLatest = () => {
    setPinned(true);
    scrollToLatest(true);
  };

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
      Alert.alert('This history contains unsupported media', `${modelLabel(next)} is not configured for ${incompatible.join(', ')} input.`, [
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

  const allowedMimeTypes = model ? mimeTypesFor(model) : [];
  const allowLibrary = Boolean(model && (model.capabilities.image.value || model.capabilities.video.value));
  const allowFiles = allowedMimeTypes.length > 0;
  const includeImages = Boolean(model?.capabilities.image.value);
  const includeVideos = Boolean(model?.capabilities.video.value);

  const ingestPickedAssets = async (assets: { uri: string; name: string; mimeType: string; size?: number }[]) => {
    if (!useSalStore.getState().db) return;
    const accepted: typeof assets = [];
    const skipped: string[] = [];
    for (const asset of assets) {
      if (allowedMimeTypes.length && !mimeTypeAllowed(asset.mimeType, allowedMimeTypes)) {
        skipped.push(asset.name);
        continue;
      }
      accepted.push(asset);
    }
    if (skipped.length) {
      Alert.alert(
        skipped.length === 1 ? 'This file type is not enabled' : 'Some files were skipped',
        `${skipped.join(', ')} can’t be attached to ${model ? modelLabel(model) : 'this model'}.`,
      );
    }
    const imported: string[] = [];
    for (const asset of accepted) {
      try {
        const blob = await importAttachment(useSalStore.getState().db!, {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType,
          ...(asset.size !== undefined ? { size: asset.size } : {}),
        });
        await saveAttachment(blob);
        imported.push(blob.id);
      } catch (error) {
        Alert.alert('Could not attach file', error instanceof Error ? error.message : String(error));
      }
    }
    if (imported.length) setPending((current) => [...new Set([...current, ...imported])]);
  };

  const pickFromLibrary = async () => {
    if (!model) return;
    const mediaTypes: ImagePicker.MediaType[] = [
      ...(model.capabilities.image.value ? (['images'] as const) : []),
      ...(model.capabilities.video.value ? (['videos'] as const) : []),
    ];
    if (!mediaTypes.length) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsMultipleSelection: true,
        orderedSelection: true,
        quality: 1,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      await ingestPickedAssets(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName?.trim() || (asset.type === 'video' ? 'video.mp4' : 'image.jpg'),
          mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          ...(asset.fileSize !== undefined ? { size: asset.fileSize } : {}),
        })),
      );
    } catch (error) {
      Alert.alert('Could not open photo library', error instanceof Error ? error.message : String(error));
    }
  };

  const pickFromFiles = async () => {
    if (!allowedMimeTypes.length) return;
    const result = await DocumentPicker.getDocumentAsync({ type: allowedMimeTypes, multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    await ingestPickedAssets(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        ...(asset.size !== undefined ? { size: asset.size } : {}),
      })),
    );
  };

  const openAttachMenu = () => {
    if (!model) return;
    if (!allowFiles) {
      alertWithSettings(
        'This model does not have attachment support enabled.',
        'Turn on image, audio, or video input in this model’s settings.',
        { kind: 'model', modelId: model.id, focus: 'capabilities' },
      );
      return;
    }
    if (!allowLibrary) {
      void pickFromFiles();
      return;
    }
    if (showAttachMenu) {
      setShowAttachMenu(false);
      return;
    }
    if (settings.hapticsEnabled) void Haptics.selectionAsync();
    setShowAttachMenu(true);
  };

  const chooseAttachSource = (source: AttachSource) => {
    setShowAttachMenu(false);
    if (source === 'library') void pickFromLibrary();
    else void pickFromFiles();
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
    setShowAttachMenu(false);
    setText('');
    setPending([]);
    router.replace({ pathname: '/chat/[id]', params: { id: next.id } });
  };

  const submit = async () => {
    if ((!text.trim() && !pending.length) || !model || sending) return;
    const outgoing = text;
    const outgoingAttachments = pending;
    pinnedToBottomRef.current = true;
    setShowJumpToLatest(false);
    setShowAttachMenu(false);
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
        <Pressable
          accessibilityLabel="Open chat history"
          onPress={() => {
            setShowAttachMenu(false);
            setShowHistory(true);
          }}
          style={styles.headerButton}
        >
          <Ionicons name="menu-outline" size={24} color={theme.text} />
        </Pressable>
        <Pressable
          style={styles.titleWrap}
          onPress={() => {
            setShowAttachMenu(false);
            setShowModels(true);
          }}
        >
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{model ? modelLabel(model) : 'Choose a model'}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.muted} />
        </Pressable>
        <Pressable accessibilityLabel="Start a new chat" onPress={() => void startNewChat()} style={styles.headerButton}>
          <Ionicons name="create-outline" size={22} color={theme.text} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            style={styles.list}
            data={messages}
            key={conversationId ?? 'new'}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messages, !messages.length && styles.center]}
            ItemSeparatorComponent={MessageSeparator}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            removeClippedSubviews={false}
            windowSize={31}
            onScroll={syncPinnedFromScroll}
            onMomentumScrollEnd={syncPinnedFromScroll}
            scrollEventThrottle={16}
            onContentSizeChange={(_width, height) => followIfPinned(height)}
            onLayout={() => followIfPinned()}
            renderItem={({ item }) => <MessageBubble message={item} attachments={attachments} onOpenSettings={openSettings} />}
            ListEmptyComponent={
              <View style={styles.welcome}>
                <Text style={[styles.welcomeTitle, { color: theme.text }]}>{model ? 'Ready when you are.' : 'Add a provider to start.'}</Text>
                <Text style={[styles.welcomeBody, { color: theme.muted }]}>
                  {model ? `Messages go directly to ${provider?.displayName ?? modelLabel(model)}.` : 'Connect OpenAI, Ollama, or llama.cpp. History stays on this device.'}
                </Text>
                {!model ? (
                  <Pressable onPress={() => router.push('/models')} style={[styles.setup, { backgroundColor: theme.accent }]}>
                    <Text style={styles.setupText}>Add a provider</Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
          {showJumpToLatest ? (
            <View pointerEvents="box-none" style={styles.jumpWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Jump to latest"
                onPress={jumpToLatest}
                style={[styles.jump, { backgroundColor: theme.surface, borderColor: theme.line }]}
              >
                <Ionicons name="chevron-down" size={14} color={theme.accent} />
                <Text style={[styles.jumpText, { color: theme.text }]}>Latest</Text>
              </Pressable>
            </View>
          ) : null}
          {showAttachMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss attachment options"
              onPress={() => setShowAttachMenu(false)}
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
        </View>
        <View style={{ paddingBottom: composerBottom }}>
          <Composer
            text={text}
            onChangeText={setText}
            placeholder={composerPlaceholder(model)}
            pending={pending}
            attachments={attachments}
            canSend={Boolean(model && (text.trim() || pending.length))}
            sending={sending}
            canAttach={Boolean(model)}
            attachMenuOpen={showAttachMenu}
            allowLibrary={allowLibrary}
            allowFiles={allowFiles}
            includeImages={includeImages}
            includeVideos={includeVideos}
            onAttach={openAttachMenu}
            onAttachSource={chooseAttachSource}
            onRemoveAttachment={(id) => setPending((current) => current.filter((item) => item !== id))}
            onSend={() => void submit()}
            onStop={() => conversation && stopGeneration(conversation.id)}
          />
        </View>
      </View>
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

function MessageSeparator() {
  return <View style={styles.separator} />;
}

function mimeTypesFor(model: Model): string[] {
  return [
    ...(model.capabilities.image.value ? model.limits.imageMimeTypes.value : []),
    ...(model.capabilities.audio.value ? model.limits.audioMimeTypes.value : []),
    ...(model.capabilities.video.value ? model.limits.videoMimeTypes.value : []),
  ];
}

function mimeTypeAllowed(mime: string, allowed: string[]): boolean {
  const normalized = mime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mime.toLowerCase();
  return allowed.some((type) => {
    const candidate = type.toLowerCase();
    if (candidate === normalized) return true;
    return candidate.endsWith('/*') && normalized.startsWith(candidate.slice(0, -1));
  });
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
  header: { minHeight: HEADER_HEIGHT, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  title: { fontSize: 16, fontFamily: font.semibold, maxWidth: '80%' },
  body: { flex: 1 },
  listWrap: { flex: 1 },
  list: { flex: 1 },
  messages: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 28 },
  separator: { height: 22 },
  center: { flexGrow: 1, justifyContent: 'center' },
  welcome: { alignItems: 'center', paddingHorizontal: 36 },
  welcomeTitle: { fontSize: 26, fontFamily: font.bold, letterSpacing: -0.6, textAlign: 'center' },
  welcomeBody: { fontSize: 15, textAlign: 'center', lineHeight: 21, marginTop: 8, fontFamily: font.regular },
  setup: { marginTop: 22, minHeight: 44, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  setupText: { color: '#FFF', fontSize: 15, fontFamily: font.semibold },
  jumpWrap: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' },
  jump: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  jumpText: { fontSize: 13, fontFamily: font.semibold },
});
