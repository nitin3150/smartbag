import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { API_BASE_URL } from '../../config/apiConfig';

interface Order {
  _id: string;
  order_status: string;
  total_amount: number;
  created_at: string;
  payment_method: string;
  user_info?: {
    name: string;
    phone: string;
    email: string;
  };
  delivery_address?: {
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  items?: Array<{
    product: string;
    product_name: string;
    product_image: any[];
    quantity: number;
    price: number;
  }>;
}

type TabType = 'available' | 'assigned' | 'delivered';

export default function DeliveryScreen() {
  console.log('DeliveryScreen component loaded');
  
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTab, setCurrentTab] = useState<TabType>('available');
  
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAvailableOrders = async () => {
    if (!token) return [];
    
    try {
      console.log('Fetching available orders...');
      const response = await fetch(`${API_BASE_URL}delivery/available`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Only delivery partners can access this.');
        }
        throw new Error(`Failed to fetch available orders: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Available orders fetched:', data.length);
      return data;
    } catch (error) {
      console.error('Error fetching available orders:', error);
      throw error;
    }
  };

  const fetchAssignedOrders = async () => {
    if (!token) return [];
    
    try {
      console.log('Fetching assigned orders...');
      const response = await fetch(`${API_BASE_URL}delivery/assigned`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Only delivery partners can access this.');
        }
        throw new Error(`Failed to fetch assigned orders: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Assigned orders fetched:', data.length);
      return data;
    } catch (error) {
      console.error('Error fetching assigned orders:', error);
      throw error;
    }
  };

  const fetchDeliveredOrders = async () => {
    if (!token) return [];
    
    try {
      console.log('Fetching delivered orders...');
      const response = await fetch(`${API_BASE_URL}delivery/delivered`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Only delivery partners can access this.');
        }
        throw new Error(`Failed to fetch delivered orders: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Delivered orders fetched:', data.length);
      return data;
    } catch (error) {
      console.error('Error fetching delivered orders:', error);
      throw error;
    }
  };

  const fetchOrders = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    console.log('Fetching delivery orders...');
    
    try {
      const [available, assigned, delivered] = await Promise.all([
        fetchAvailableOrders(),
        fetchAssignedOrders(),
        fetchDeliveredOrders()
      ]);

      setAvailableOrders(available);
      setAssignedOrders(assigned);
      setDeliveredOrders(delivered);

      console.log('All orders loaded successfully');

    } catch (error) {
      console.error('Error fetching orders:', error);
      Alert.alert('Error', `Failed to fetch orders: ${error.message || 'Please check your connection.'}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  useEffect(() => {
    console.log('DeliveryScreen useEffect - User role:', user?.role);
    
    if (user && user.role !== 'delivery_partner') {
      Alert.alert(
        'Access Denied',
        'This section is only for delivery partners.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
      return;
    }

    if (user?.role === 'delivery_partner') {
      fetchOrders();
    }
  }, [user, fetchOrders]);

  const handleAcceptOrder = async (orderId: string) => {
    Alert.alert(
      'Accept Order',
      'Are you sure you want to accept this delivery?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setActionLoading(true);
            try {
              console.log('Accepting order:', orderId);
              
              const response = await fetch(`${API_BASE_URL}delivery/${orderId}/accept`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to accept order');
              }

              const data = await response.json();
              console.log('Order accepted:', data);
              
              Alert.alert('Success', 'Order accepted!');
              
              await fetchOrders();
              setCurrentTab('assigned');
              
            } catch (error) {
              console.error('Error accepting order:', error);
              Alert.alert('Error', `Failed to accept order: ${error.message || 'Please try again.'}`);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleMarkAsDelivered = async (orderId: string) => {
    Alert.alert(
      'Mark as Delivered',
      'Confirm that this order has been delivered to the customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActionLoading(true);
            try {
              console.log('Marking order as delivered:', orderId);
              
              const response = await fetch(`${API_BASE_URL}delivery/${orderId}/mark-delivered`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to mark order as delivered');
              }

              const data = await response.json();
              console.log('Order marked as delivered:', data);
              
              Alert.alert('Success', 'Order marked as delivered!');
              
              await fetchOrders();
              setIsModalVisible(false);
              setCurrentTab('delivered');
              
            } catch (error) {
              console.error('Error marking as delivered:', error);
              Alert.alert('Error', `Failed to update order status: ${error.message || 'Please try again.'}`);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsModalVisible(true);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9500';
      case 'confirmed': return '#007AFF';
      case 'assigned': return '#5856D6';
      case 'out_for_delivery': return '#FF2D92';
      case 'delivered': return '#34C759';
      default: return '#8E8E93';
    }
  };

  const getCurrentTabData = (): Order[] => {
    switch (currentTab) {
      case 'available': return availableOrders;
      case 'assigned': return assignedOrders;
      case 'delivered': return deliveredOrders;
      default: return [];
    }
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => currentTab === 'assigned' ? openOrderDetails(item) : undefined}
      activeOpacity={currentTab === 'assigned' ? 0.7 : 1}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderInfo}>
          <Text style={styles.orderId}>Order #{item._id.toUpperCase()}</Text>
          <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.order_status) }]}>
          <Text style={styles.statusText}>{item.order_status}</Text>
        </View>
      </View>

      {currentTab === 'assigned' && (
        <View style={styles.assignedOrderDetails}>
          <View style={styles.customerSection}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.customerName}>{item.user_info?.name || 'N/A'}</Text>
          </View>
          
          <View style={styles.addressSection}>
            <Ionicons name="location-outline" size={16} color="#666" />
            <Text style={styles.deliveryAddress} numberOfLines={2}>
              {item.delivery_address ? 
                `${item.delivery_address.address}, ${item.delivery_address.city}, ${item.delivery_address.state} - ${item.delivery_address.pincode}` : 
                'Address not available'
              }
            </Text>
          </View>

          <View style={styles.itemsPreview}>
            <Ionicons name="cube-outline" size={16} color="#666" />
            <Text style={styles.itemsCount}>
              {item.items?.length || 0} item{(item.items?.length || 0) !== 1 ? 's' : ''}
            </Text>
          </View>

          {item.payment_method === 'cod' && (
            <View style={styles.amountSection}>
              <Ionicons name="cash-outline" size={16} color="#34C759" />
              <Text style={styles.codLabel}>Cash on Delivery</Text>
              <Text style={styles.orderAmount}>₹{(item.total_amount || 0).toFixed(2)}</Text>
            </View>
          )}
        </View>
      )}

      {currentTab === 'available' && (
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={(e) => {
            e.stopPropagation();
            handleAcceptOrder(item.id);
          }}
          disabled={actionLoading}
        >
          <Text style={styles.acceptButtonText}>
            {actionLoading ? 'Accepting...' : 'Accept Delivery'}
          </Text>
        </TouchableOpacity>
      )}

      {currentTab === 'assigned' && (
        <TouchableOpacity
          style={styles.deliveredButton}
          onPress={(e) => {
            e.stopPropagation();
            handleMarkAsDelivered(item._id);
          }}
          disabled={actionLoading}
        >
          <Text style={styles.deliveredButtonText}>
            {actionLoading ? 'Updating...' : 'Mark as Delivered'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderTabContent = () => {
    const tabData = getCurrentTabData();
    
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={tabData}
        renderItem={renderOrder}
        keyExtractor={(item) => item._id}
        style={styles.ordersList}
        contentContainerStyle={styles.ordersListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons 
              name={currentTab === 'available' ? 'storefront-outline' : 
                   currentTab === 'assigned' ? 'bicycle-outline' : 'checkmark-circle-outline'} 
              size={64} 
              color="#ccc" 
            />
            <Text style={styles.emptyTitle}>
              {currentTab === 'available' ? 'No Available Orders' :
               currentTab === 'assigned' ? 'No Assigned Orders' : 'No Delivered Orders'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {currentTab === 'available' ? 'Check back later for new delivery opportunities' :
               currentTab === 'assigned' ? 'You have no orders assigned for delivery' : 
               'You haven\'t delivered any orders yet'}
            </Text>
          </View>
        }
      />
    );
  };

  console.log('Rendering DeliveryScreen component');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery Dashboard</Text>
        <TouchableOpacity onPress={onRefresh} disabled={loading || refreshing}>
          <Ionicons 
            name="refresh" 
            size={24} 
            color={loading || refreshing ? "#ccc" : "#007AFF"} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'available' && styles.activeTab]}
          onPress={() => setCurrentTab('available')}
        >
          <Ionicons 
            name="storefront-outline" 
            size={20} 
            color={currentTab === 'available' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, currentTab === 'available' && styles.activeTabText]}>
            Available
          </Text>
          {availableOrders.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{availableOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'assigned' && styles.activeTab]}
          onPress={() => setCurrentTab('assigned')}
        >
          <Ionicons 
            name="bicycle-outline" 
            size={20} 
            color={currentTab === 'assigned' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, currentTab === 'assigned' && styles.activeTabText]}>
            Assigned
          </Text>
          {assignedOrders.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{assignedOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'delivered' && styles.activeTab]}
          onPress={() => setCurrentTab('delivered')}
        >
          <Ionicons 
            name="checkmark-circle-outline" 
            size={20} 
            color={currentTab === 'delivered' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, currentTab === 'delivered' && styles.activeTabText]}>
            Delivered
          </Text>
          {deliveredOrders.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{deliveredOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {renderTabContent()}

      {selectedOrder && (
        <Modal
          animationType="slide"
          presentationStyle="pageSheet"
          visible={isModalVisible}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Order Details</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.modalContentScroll}>
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Order Information</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Order ID:</Text>
                  <Text style={styles.detailValue}>#{selectedOrder.id.toUpperCase()}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <View style={[
                    styles.inlineStatusBadge,
                    { backgroundColor: getStatusColor(selectedOrder.order_status) }
                  ]}>
                    <Text style={styles.inlineStatusText}>{selectedOrder.order_status}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Customer Details</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{selectedOrder.user_info?.name || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone:</Text>
                  <Text style={styles.detailValue}>{selectedOrder.user_info?.phone || 'N/A'}</Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Delivery Address</Text>
                <Text style={styles.addressText}>
                  {selectedOrder.delivery_address?.address}
                </Text>
                <Text style={styles.addressText}>
                  {selectedOrder.delivery_address?.city}, {selectedOrder.delivery_address?.state}
                </Text>
                <Text style={styles.addressText}>
                  PIN: {selectedOrder.delivery_address?.pincode}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Order Items</Text>
                {(selectedOrder.items || []).map((orderItem, index) => (
                  <View key={index} style={styles.orderItemRow}>
                    <View style={styles.orderItemInfo}>
                      <Text style={styles.orderItemName}>
                        {orderItem.product_name || 'Product not available'}
                      </Text>
                      <Text style={styles.orderItemQuantity}>Qty: {orderItem.quantity || 0}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {selectedOrder.payment_method === 'cod' && (
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>Cash on Delivery</Text>
                  <Text style={styles.codAmount}>₹{(selectedOrder.total_amount || 0).toFixed(2)}</Text>
                  <Text style={styles.codNote}>Collect this amount from customer</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalDeliveredButton}
                  onPress={() => handleMarkAsDelivered(selectedOrder._id)}
                  disabled={actionLoading}
                >
                  <Text style={styles.modalDeliveredButtonText}>
                    {actionLoading ? 'Updating...' : 'Mark as Delivered'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    position: 'relative',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  tabBadge: {
    position: 'absolute',
    top: 4,
    right: 20,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  ordersList: {
    flex: 1,
  },
  ordersListContent: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderInfo: {
    flex: 1,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  assignedOrderDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  customerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    fontWeight: '500',
  },
  addressSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  deliveryAddress: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  itemsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemsCount: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
  },
  amountSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  codLabel: {
    fontSize: 13,
    color: '#34C759',
    marginLeft: 8,
    flex: 1,
    fontWeight: '500',
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#34C759',
  },
  acceptButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deliveredButton: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  deliveredButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
    lineHeight: 22,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 50,
  },
  modalContentScroll: {
    flex: 1,
  },
  detailSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  inlineStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inlineStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  addressText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
    lineHeight: 20,
  },
  orderItemRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  orderItemQuantity: {
    fontSize: 13,
    color: '#666',
  },
  codAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#34C759',
    marginTop: 8,
  },
  codNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalActions: {
    padding: 16,
    marginBottom: 20,
  },
  modalDeliveredButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalDeliveredButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});