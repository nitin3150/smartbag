import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { View, Text } from 'react-native';

import { useColorScheme } from '../hooks/useColorScheme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { OrderTrackingProvider } from '../contexts/OrderTrackingContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OrderTrackingProvider>
          <RootLayoutNav />
        </OrderTrackingProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const { token, loading } = useAuth();

  if (!loaded || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="order-tracking" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}