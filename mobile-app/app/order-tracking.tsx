import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useOrderTracking } from '../contexts/OrderTrackingContext';
import { API_BASE_URL } from '../config/apiConfig';
import { useAuth } from '../contexts/AuthContext';

export default function OrderTrackingScreen() {
  const { activeOrder, loading, refreshActiveOrder } = useOrderTracking();
  const { token } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (activeOrder?._id) {
      fetchOrderDetails();
    }
  }, [activeOrder?._id]);

  const fetchOrderDetails = async () => {
    if (!activeOrder?._id || !token) return;

    setLoadingDetails(true);
    try {
      const response = await fetch(`${API_BASE_URL}orders/${activeOrder._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOrderDetails(data);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshActiveOrder(), fetchOrderDetails()]);
    setRefreshing(false);
  };

  const handleCallDeliveryPartner = () => {
    if (activeOrder?.delivery_partner?.phone) {
      Linking.openURL(`tel:${activeOrder.delivery_partner.phone}`);
    } else {
      Alert.alert('Info', 'Delivery partner contact not available yet');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'confirmed':
        return '#007AFF';
      case 'preparing':
        return '#5856D6';
      case 'out_for_delivery':
        return '#FF9500';
      case 'arrived':
      case 'delivered':
        return '#34C759';
      default:
        return '#8E8E93';
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading && !activeOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading order status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Tracking</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Active Orders</Text>
          <Text style={styles.emptySubtitle}>
            You don't have any orders being delivered right now
          </Text>
          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Text style={styles.shopButtonText}>Start Shopping</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Status</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Map Placeholder */}
        <View style={styles.mapContainer}>
          <Ionicons name="location" size={80} color="#007AFF" />
          <Text style={styles.mapText}>Live tracking coming soon</Text>
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.statusLabel}>
                {activeOrder.order_status === 'arrived' ? 'Arrived at' : 'Status'}
              </Text>
              {activeOrder.order_status === 'arrived' && (
                <Text style={styles.arrivalTime}>
                  {formatTime(activeOrder.actual_delivery)}
                </Text>
              )}
            </View>
            <View style={styles.statusIconContainer}>
              <Ionicons name="checkmark-circle" size={48} color={getStatusColor(activeOrder.order_status)} />
            </View>
          </View>

          <Text style={styles.statusTitle}>
            {activeOrder.order_status === 'preparing' && 'Your order is being prepared'}
            {activeOrder.order_status === 'out_for_delivery' && 'On the way'}
            {activeOrder.order_status === 'arrived' && 'Your order has arrived'}
            {activeOrder.order_status === 'delivered' && 'Delivered successfully'}
          </Text>

          {activeOrder.status_message && (
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{activeOrder.status_message}</Text>
            </View>
          )}
        </View>

        {/* Delivery Partner Card */}
        {activeOrder.delivery_partner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Partner</Text>
            <View style={styles.partnerCard}>
              <View style={styles.partnerInfo}>
                <View style={styles.partnerAvatar}>
                  <Ionicons name="person" size={28} color="#fff" />
                </View>
                <View style={styles.partnerDetails}>
                  <Text style={styles.partnerName}>
                    {activeOrder.delivery_partner.name}
                  </Text>
                  {activeOrder.delivery_partner.rating && (
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={14} color="#FFD700" />
                      <Text style={styles.ratingText}>
                        {activeOrder.delivery_partner.rating.toFixed(1)}
                      </Text>
                      {activeOrder.delivery_partner.deliveries && (
                        <Text style={styles.deliveriesText}>
                          • {activeOrder.delivery_partner.deliveries} deliveries
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.callButton}
                onPress={handleCallDeliveryPartner}
              >
                <Ionicons name="call" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Order Items Summary */}
        {orderDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Items</Text>
            <View style={styles.itemsCard}>
              {orderDetails.items?.map((item: any, index: number) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {item.product_name} x{item.quantity}
                  </Text>
                  <Text style={styles.itemPrice}>
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  ₹{orderDetails.total_amount?.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Timeline</Text>
          <View style={styles.timelineCard}>
            {renderTimelineItem('delivered', 'Delivered', activeOrder.actual_delivery, activeOrder.order_status === 'delivered')}
            {renderTimelineItem('arrived', 'Arrived at location', activeOrder.actual_delivery, activeOrder.order_status === 'arrived' || activeOrder.order_status === 'delivered')}
            {renderTimelineItem('out_for_delivery', 'Out for delivery', null, ['out_for_delivery', 'arrived', 'delivered'].includes(activeOrder.order_status))}
            {renderTimelineItem('preparing', 'Being prepared', null, ['preparing', 'out_for_delivery', 'arrived', 'delivered'].includes(activeOrder.order_status))}
            {renderTimelineItem('confirmed', 'Order confirmed', null, true)}
          </View>
        </View>

        {/* Help Section */}
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => router.push('/help-support')}
        >
          <Ionicons name="help-circle-outline" size={24} color="#007AFF" />
          <Text style={styles.helpText}>Need help with this order?</Text>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );

  function renderTimelineItem(status: string, label: string, time: string | null, isCompleted: boolean) {
    return (
      <View style={styles.timelineItem}>
        <View style={styles.timelineIndicator}>
          <View style={[
            styles.timelineDot,
            isCompleted && styles.timelineDotCompleted
          ]} />
          {status !== 'confirmed' && (
            <View style={[
              styles.timelineLine,
              isCompleted && styles.timelineLineCompleted
            ]} />
          )}
        </View>
        <View style={styles.timelineContent}>
          <Text style={[
            styles.timelineLabel,
            isCompleted && styles.timelineLabelCompleted
          ]}>
            {label}
          </Text>
          {time && <Text style={styles.timelineTime}>{formatTime(time)}</Text>}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  shopButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  shopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  mapContainer: {
    height: 200,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  mapText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  statusCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  arrivalTime: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#34C759',
  },
  statusIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  messageContainer: {
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
    marginTop: 12,
  },
  messageText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  partnerCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  partnerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  partnerDetails: {
    flex: 1,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  deliveriesText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  itemsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  timelineCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineIndicator: {
    alignItems: 'center',
    marginRight: 12,
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    borderWidth: 3,
    borderColor: '#fff',
  },
  timelineDotCompleted: {
    backgroundColor: '#34C759',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#e0e0e0',
    marginTop: 4,
  },
  timelineLineCompleted: {
    backgroundColor: '#34C759',
  },
  timelineContent: {
    flex: 1,
    paddingTop: 2,
  },
  timelineLabel: {
    fontSize: 15,
    color: '#999',
    marginBottom: 2,
  },
  timelineLabelCompleted: {
    color: '#333',
    fontWeight: '500',
  },
  timelineTime: {
    fontSize: 13,
    color: '#666',
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  helpText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 12,
  },
});