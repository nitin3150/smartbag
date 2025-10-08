import { Tabs, useSegments, usePathname } from 'expo-router';
import { Platform, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTab } from '@/components/HapticTab';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import AuthWrapper from '@/components/AuthWrapper';
import { useAuth } from '@/contexts/AuthContext';
import { OrderStatusBanner } from '@/components/OrderStatusBanner';
import { useEffect } from 'react';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const segments = useSegments();

  // ✅ Debug logging
  useEffect(() => {
    console.log('🔍 Layout pathname:', pathname);
    console.log('🔍 Layout segments:', segments);
  }, [pathname, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user || !user.role) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const isPartner = user.role === 'delivery_partner';
  
  // ✅ Better detection for home screen using segments
  const isHomeScreen = segments[segments.length - 1] === 'index' || 
                       segments[segments.length - 1] === undefined ||
                       pathname === '/(tabs)' || 
                       pathname === '/(tabs)/' ||
                       pathname === '/';
  
  console.log('🔍 Is Home Screen:', isHomeScreen);

  return (
    <AuthWrapper>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarBackground: TabBarBackground,
            tabBarStyle: Platform.select({
              ios: {
                position: 'absolute',
              },
              default: {},
            }),
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} />, 
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Cart',
              tabBarIcon: ({ color }) => <Ionicons name="cart-outline" size={24} color={color} />, 
            }}
          />
          <Tabs.Screen
            name="delivery"
            options={{
              title: 'Delivery',
              tabBarIcon: ({ color }) => <Ionicons name="bicycle-outline" size={24} color={color} />, 
              href: isPartner ? undefined : null,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={24} color={color} />, 
            }}
          />
        </Tabs>
        
        {/* ✅ Only show banner on home screen */}
        {isHomeScreen && <OrderStatusBanner />}
      </View>
    </AuthWrapper>
  );
}