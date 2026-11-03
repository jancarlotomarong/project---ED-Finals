import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { initAuth, useAuth } from '@/lib/auth';

const headerOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: COLORS.background },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { fontWeight: '700' as const },
  headerShadowVisible: false,
};

export default function RootLayout() {
  const { session, loading } = useAuth();

  // EVENT: app starts -> restore the saved (secure) session
  useEffect(() => {
    initAuth();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isSignedIn = !!session;

  // Route guard: signed-out users can only see login/register,
  // signed-in users can only see the app screens.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="event/[id]"
          options={{ ...headerOptions, title: 'Event' }}
        />
        <Stack.Screen
          name="event-form"
          options={{ ...headerOptions, title: 'Event' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});