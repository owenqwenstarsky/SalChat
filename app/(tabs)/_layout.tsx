import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.accent,
      tabBarInactiveTintColor: theme.muted,
      tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.line, height: 82, paddingTop: 8, paddingBottom: 20 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="models" options={{ title: 'Models', tabBarIcon: ({ color, size }) => <Ionicons name="layers-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="attachments" options={{ title: 'Attachments', tabBarIcon: ({ color, size }) => <Ionicons name="attach-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="options-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
