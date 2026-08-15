import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/chat/ChatScreen';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen conversationId={typeof id === 'string' ? id : id?.[0] ?? null} />;
}
