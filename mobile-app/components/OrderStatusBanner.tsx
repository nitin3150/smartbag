// import { useState, useEffect, useRef } from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   Animated,
//   Platform,
// } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import { router } from 'expo-router';
// import { useOrderTracking } from '../contexts/OrderTrackingContext';

// export function OrderStatusBanner() {
//   const slideAnim = useRef(new Animated.Value(100)).current;
//   const { activeOrder } = useOrderTracking();

//   useEffect(() => {
//     if (activeOrder) {
//       Animated.spring(slideAnim, {
//         toValue: 0,
//         useNativeDriver: true,
//         tension: 50,
//         friction: 8,
//       }).start();
//     } else {
//       Animated.timing(slideAnim, {
//         toValue: 100,
//         duration: 300,
//         useNativeDriver: true,
//       }).start();
//     }
//   }, [activeOrder, slideAnim]);

//   if (!activeOrder) return null;

//   const getStatusConfig = () => {
//     switch (activeOrder.order_status) {
//       case 'preparing':
//         return {
//           text: 'Your order is being prepared',
//           icon: 'restaurant' as const,
//           bgColor: '#5856D6',
//         };
//       case 'out_for_delivery':
//         return {
//           text: 'Order is on the way',
//           icon: 'bicycle' as const,
//           bgColor: '#FF9500',
//         };
//       case 'arrived':
//         return {
//           text: 'Your order has arrived! 🎉',
//           icon: 'checkmark-circle' as const,
//           bgColor: '#34C759',
//         };
//       default:
//         return {
//           text: 'Order confirmed',
//           icon: 'checkmark-circle' as const,
//           bgColor: '#007AFF',
//         };
//     }
//   };

//   const config = getStatusConfig();

//   return (
//     <Animated.View
//       style={[
//         styles.container,
//         {
//           backgroundColor: config.bgColor,
//           transform: [{ translateY: slideAnim }],
//         },
//       ]}
//     >
//       <TouchableOpacity
//         style={styles.touchable}
//         onPress={() => router.push('/order-tracking')}
//         activeOpacity={0.9}
//       >
//         <View style={styles.content}>
//           <View style={styles.iconContainer}>
//             <Ionicons name={config.icon} size={24} color="#fff" />
//           </View>
//           <View style={styles.textContainer}>
//             <Text style={styles.statusText}>{config.text}</Text>
//             <Text style={styles.subText}>Tap for details</Text>
//           </View>
//           <Ionicons name="chevron-forward" size={24} color="#fff" />
//         </View>
//       </TouchableOpacity>
//     </Animated.View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     position: 'absolute',
//     bottom: 0,
//     left: 0,
//     right: 0,
//     zIndex: 999,
//     ...Platform.select({
//       ios: {
//         shadowColor: '#000',
//         shadowOffset: { width: 0, height: -2 },
//         shadowOpacity: 0.25,
//         shadowRadius: 8,
//       },
//       android: {
//         elevation: 8,
//       },
//     }),
//   },
//   touchable: {
//     width: '100%',
//   },
//   content: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 16,
//     paddingVertical: 16,
//     paddingBottom: Platform.OS === 'ios' ? 32 : 16,
//   },
//   iconContainer: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     backgroundColor: 'rgba(255, 255, 255, 0.2)',
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginRight: 12,
//   },
//   textContainer: {
//     flex: 1,
//   },
//   statusText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: '600',
//     marginBottom: 2,
//   },
//   subText: {
//     color: 'rgba(255, 255, 255, 0.8)',
//     fontSize: 13,
//   },
// });

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useOrderTracking } from '../contexts/OrderTrackingContext';

export function OrderStatusBanner() {
  const slideAnim = useRef(new Animated.Value(100)).current;
  
  // Safely get tracking data
  let activeOrder = null;
  try {
    const tracking = useOrderTracking();
    activeOrder = tracking.activeOrder;
  } catch (error) {
    console.log('OrderStatusBanner: Context not ready yet');
    return null;
  }

  useEffect(() => {
    if (activeOrder) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [activeOrder, slideAnim]);

  if (!activeOrder) return null;

  const getStatusConfig = () => {
    switch (activeOrder.order_status) {
      case 'preparing':
        return {
          text: 'Your order is being prepared',
          icon: 'restaurant' as const,
          bgColor: '#5856D6',
        };
      case 'out_for_delivery':
        return {
          text: 'Order is on the way',
          icon: 'bicycle' as const,
          bgColor: '#FF9500',
        };
      case 'arrived':
        return {
          text: 'Your order has arrived! 🎉',
          icon: 'checkmark-circle' as const,
          bgColor: '#34C759',
        };
      default:
        return {
          text: 'Order confirmed',
          icon: 'checkmark-circle' as const,
          bgColor: '#007AFF',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.bgColor,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.touchable}
        onPress={() => router.push('/order-tracking')}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name={config.icon} size={24} color="#fff" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.statusText}>{config.text}</Text>
            <Text style={styles.subText}>Tap for details</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 49 : 56,
    left: 0,
    right: 0,
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  touchable: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    // paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  subText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
  },
});