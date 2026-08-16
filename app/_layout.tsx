import { Suspense, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SourceSans3_400Regular, SourceSans3_600SemiBold, SourceSans3_700Bold } from '@expo-google-fonts/source-sans-3';
import { DialogHost } from '@/components/Dialogs';
import { WebSqliteGate } from '@/components/WebSqliteGate';
import { migrateDatabase } from '@/storage/database';
import { useSalStore } from '@/state/store';
import { useTheme } from '@/theme';

export default function RootLayout() {
  return (
    <WebSqliteGate>
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName="sal-chat.db" onInit={migrateDatabase} useSuspense>
          <Bootstrap />
        </SQLiteProvider>
      </Suspense>
    </WebSqliteGate>
  );
}

function Bootstrap() {
  const db = useSQLiteContext();
  const hydrate = useSalStore((state) => state.hydrate);
  const initialized = useSalStore((state) => state.initialized);
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
  });
  useEffect(() => { void hydrate(db); }, [db, hydrate]);
  if (!initialized || (!fontsLoaded && !fontError)) return <Loading />;
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="models" />
        <Stack.Screen name="attachments" />
        <Stack.Screen name="provider/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="provider/[id]" />
        <Stack.Screen name="model/[id]" />
      </Stack>
      <DialogHost />
    </View>
  );
}

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#E96D52" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' },
});
