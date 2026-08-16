import { Component, useEffect, useState, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/UI';
import { browserWebSqliteHost, createWebSqliteLockSession, isOpfsAccessHandleError, type WebSqliteLockStatus } from '@/storage/webSqliteLock';
import { font, palette, space } from '@/theme';

export function WebSqliteGate({ children }: PropsWithChildren) {
  const [session] = useState(() => {
    const host = browserWebSqliteHost();
    return host ? createWebSqliteLockSession(host) : null;
  });
  if (!session) return children;
  return <LockedGate session={session}>{children}</LockedGate>;
}

function LockedGate({
  children,
  session,
}: PropsWithChildren<{ session: ReturnType<typeof createWebSqliteLockSession> }>) {
  const [status, setStatus] = useState<WebSqliteLockStatus>('checking');

  useEffect(() => {
    const unsubscribe = session.subscribe(setStatus);
    void session.claim();
    const onHide = () => session.release('blocked');
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      if (session.status === 'ready') session.release('blocked');
    };
  }, [session]);

  if (status === 'ready') {
    return (
      <SqliteErrorBoundary onRetry={() => window.location.reload()}>
        {children}
      </SqliteErrorBoundary>
    );
  }

  const blocked = status === 'blocked' || status === 'taken';
  return (
    <View style={styles.screen}>
      {blocked ? (
        <View style={styles.card}>
          <Text style={styles.title}>{status === 'taken' ? 'Opened in another tab' : 'Already open in another tab'}</Text>
          <Text style={styles.body}>
            The browser can keep only one live copy of this database at a time. Close the other tab, or continue here and the other tab will pause.
          </Text>
          <PrimaryButton onPress={() => void session.steal()}>Use this tab</PrimaryButton>
        </View>
      ) : (
        <ActivityIndicator color={palette.coral} />
      )}
    </View>
  );
}

class SqliteErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!isOpfsAccessHandleError(error)) console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Could not open local data</Text>
          <Text style={styles.body}>
            {isOpfsAccessHandleError(this.state.error)
              ? 'Another tab or a previous session is still holding the browser database. Close other Sal Chat tabs and try again.'
              : this.state.error.message}
          </Text>
          <PrimaryButton onPress={this.props.onRetry}>Reload</PrimaryButton>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cream, padding: space.xl },
  card: { maxWidth: 420, width: '100%', gap: space.lg },
  title: { fontSize: 28, lineHeight: 34, fontFamily: font.bold, color: palette.ink, letterSpacing: -0.6, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, fontFamily: font.regular, color: palette.muted, textAlign: 'center' },
});
