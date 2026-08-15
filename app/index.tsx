import { Redirect } from 'expo-router';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { latestConversationWithMessages } from '@/domain/conversations';
import { useSalStore } from '@/state/store';

export default function HomeScreen() {
  const conversations = useSalStore((state) => state.conversations);
  const messages = useSalStore((state) => state.messages);
  const last = latestConversationWithMessages(conversations, messages);
  if (last) return <Redirect href={{ pathname: '/chat/[id]', params: { id: last.id } }} />;
  return <ChatScreen conversationId={null} />;
}
