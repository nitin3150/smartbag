import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../config/apiConfig';

interface DeliveryPartner {
  name: string;
  phone: string;
  rating?: number;
  deliveries?: number;
}

interface OrderStatusUpdate {
  _id: string;
  order_status: 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'arrived' | 'delivered';
  delivery_partner?: DeliveryPartner;
  estimated_delivery?: string;
  actual_delivery?: string;
  delivery_partner_location?: {
    latitude: number;
    longitude: number;
  };
  status_message?: string;
  timeline?: Array<{
    status: string;
    timestamp: string;
    message?: string;
  }>;
}

interface OrderTrackingContextType {
  activeOrder: OrderStatusUpdate | null;
  loading: boolean;
  refreshActiveOrder: () => Promise<void>;
}

const OrderTrackingContext = createContext<OrderTrackingContextType | undefined>(undefined);

export const useOrderTracking = () => {
  const context = useContext(OrderTrackingContext);
  if (!context) {
    // Return default values instead of throwing during initialization
    return {
      activeOrder: null,
      loading: false,
      refreshActiveOrder: async () => {},
    };
  }
  return context;
};

interface OrderTrackingProviderProps {
  children: React.ReactNode;
}

export function OrderTrackingProvider({ children }: OrderTrackingProviderProps) {
  const { token } = useAuth();
  const [activeOrder, setActiveOrder] = useState<OrderStatusUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchActiveOrder = useCallback(async () => {
    if (!token) {
      setActiveOrder(null);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}orders/active`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && !['delivered', 'cancelled'].includes(data.order_status)) {
          setActiveOrder(data);
        } else {
          setActiveOrder(null);
        }
      } else {
        setActiveOrder(null);
      }
    } catch (error) {
      console.error('Error fetching active order:', error);
      setActiveOrder(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchActiveOrder();
    
    intervalRef.current = setInterval(() => {
      fetchActiveOrder();
    }, 30000);
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchActiveOrder]);

  const value = {
    activeOrder,
    loading,
    refreshActiveOrder: fetchActiveOrder,
  };

  return (
    <OrderTrackingContext.Provider value={value}>
      {children}
    </OrderTrackingContext.Provider>
  );
}