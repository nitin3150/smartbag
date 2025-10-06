import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useDashboardStore } from "@/store/dashboardStore";
import { wsService } from "@/services/websocket";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Eye, 
  Truck, 
  Clock, 
  CheckCircle, 
  Package, 
  Loader2, 
  User, 
  Calendar, 
  MapPin, 
  ExternalLink, 
  RefreshCw,
  Filter,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  SlidersHorizontal
} from "lucide-react";
import { format, parseISO, subDays, startOfDay, endOfDay } from "date-fns";

interface DeliveryPartner {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  current_orders?: number;
}

interface OrderStatusHistory {
  status: string;
  timestamp: string;
  updated_by: string;
  notes?: string;
  delivery_partner?: string;
}

interface OrderFilters {
  status: string;
  date_range: string;
  from_date: string;
  to_date: string;
  delivery_partner: string;
  min_amount: string;
  max_amount: string;
  customer_name: string;
}

interface PaginationInfo {
  current_page: number;
  total_pages: number;
  total_orders: number;
  has_next: boolean;
  has_prev: boolean;
}

export default function Orders() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showOrderDrawer, setShowOrderDrawer] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showFiltersPopover, setShowFiltersPopover] = useState(false);
  const [deliveryPartners, setDeliveryPartners] = useState<DeliveryPartner[]>([]);
  const [deliveryRequests, setDeliveryRequests] = useState<DeliveryPartner[]>([]);
  const [selectedDeliveryPartner, setSelectedDeliveryPartner] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderStatusHistory, setOrderStatusHistory] = useState<OrderStatusHistory[]>([]);
  
  // Enhanced pagination and filtering
  const [pagination, setPagination] = useState<PaginationInfo>({
    current_page: 1,
    total_pages: 1,
    total_orders: 0,
    has_next: false,
    has_prev: false
  });
  
  const [filters, setFilters] = useState<OrderFilters>({
    status: "all",
    date_range: "all",
    from_date: "",
    to_date: "",
    delivery_partner: "all",
    min_amount: "",
    max_amount: "",
    customer_name: ""
  });

  const [pageSize, setPageSize] = useState(10);

  const statusOptions = [
    { value: "all", label: "All Orders" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "preparing", label: "Preparing" },
    { value: "prepared", label: "Prepared" },
    { value: "accepted", label: "Accepted" },
    { value: "assigned", label: "Assigned" },
    { value: "out_for_delivery", label: "Out for Delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const dateRangeOptions = [
    { value: "all", label: "All Time" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last_7_days", label: "Last 7 Days" },
    { value: "last_30_days", label: "Last 30 Days" },
    { value: "this_month", label: "This Month" },
    { value: "custom", label: "Custom Range" },
  ];

  const pageSizeOptions = [
    { value: 10, label: "10 per page" },
    { value: 25, label: "25 per page" },
    { value: 50, label: "50 per page" },
  ];

  // Load orders with current filters and pagination
  const loadOrders = (page = 1, resetPagination = false) => {
    console.log('Loading orders with filters:', filters, 'page:', page, 'search:', searchQuery);
    
    if (resetPagination) {
      setPagination(prev => ({ ...prev, current_page: 1 }));
      page = 1;
    }
    
    setIsLoading(true);
    
    // Prepare filters for backend
    const backendFilters = {
      ...filters,
      page: page,
      limit: pageSize,
      search: searchQuery.trim()
    };

    // Handle date range presets
    if (filters.date_range !== 'all' && filters.date_range !== 'custom') {
      const dateRanges = getDateRange(filters.date_range);
      backendFilters.from_date = dateRanges.from;
      backendFilters.to_date = dateRanges.to;
    }

    // Clean empty filters
    Object.keys(backendFilters).forEach(key => {
      if (backendFilters[key] === '' || backendFilters[key] === 'all') {
        delete backendFilters[key];
      }
    });

    console.log('Sending backend filters:', backendFilters);

    wsService.send({
      type: 'get_orders',
      filters: backendFilters
    });
  };

  // Get date range based on preset
  const getDateRange = (range: string) => {
    const now = new Date();
    const today = startOfDay(now);
    
    switch (range) {
      case 'today':
        return {
          from: today.toISOString(),
          to: endOfDay(now).toISOString()
        };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return {
          from: yesterday.toISOString(),
          to: endOfDay(yesterday).toISOString()
        };
      case 'last_7_days':
        return {
          from: subDays(today, 7).toISOString(),
          to: endOfDay(now).toISOString()
        };
      case 'last_30_days':
        return {
          from: subDays(today, 30).toISOString(),
          to: endOfDay(now).toISOString()
        };
      case 'this_month':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          from: startOfMonth.toISOString(),
          to: endOfDay(now).toISOString()
        };
      default:
        return { from: '', to: '' };
    }
  };

  // Handle filter changes - FIX 1: Apply filters immediately
  const handleFilterChange = (key: keyof OrderFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    
    // Apply filters immediately with the new value
    const updatedFilters = {
      ...filters,
      [key]: value
    };
    
    // Prepare filters for backend immediately
    const backendFilters = {
      ...updatedFilters,
      page: 1,
      limit: pageSize,
      search: searchQuery.trim()
    };

    // Handle date range presets
    if (updatedFilters.date_range !== 'all' && updatedFilters.date_range !== 'custom') {
      const dateRanges = getDateRange(updatedFilters.date_range);
      backendFilters.from_date = dateRanges.from;
      backendFilters.to_date = dateRanges.to;
    }

    // Clean empty filters
    Object.keys(backendFilters).forEach(key => {
      if (backendFilters[key] === '' || backendFilters[key] === 'all') {
        delete backendFilters[key];
      }
    });

    console.log('Applying filter immediately:', key, value, backendFilters);
    setIsLoading(true);
    setPagination(prev => ({ ...prev, current_page: 1 }));

    wsService.send({
      type: 'get_orders',
      filters: backendFilters
    });
  };

  // Apply filters and reset to first page
  const applyFilters = () => {
    loadOrders(1, true);
    setShowFiltersPopover(false);
  };

  // Clear all filters
  const clearFilters = () => {
    const clearedFilters = {
      status: "all",
      date_range: "all",
      from_date: "",
      to_date: "",
      delivery_partner: "all",
      min_amount: "",
      max_amount: "",
      customer_name: ""
    };
    setFilters(clearedFilters);
    setSearchQuery("");
    
    // Apply cleared filters immediately
    const backendFilters = {
      page: 1,
      limit: pageSize,
      search: ""
    };

    console.log('Clearing all filters');
    setIsLoading(true);
    setPagination(prev => ({ ...prev, current_page: 1 }));

    wsService.send({
      type: 'get_orders',
      filters: backendFilters
    });
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.total_pages) {
      setPagination(prev => ({ ...prev, current_page: page }));
      loadOrders(page);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPagination(prev => ({ ...prev, current_page: 1 }));
    loadOrders(1, true);
  };

  // FIX 2: Handle search with proper debouncing and immediate application
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      console.log('Search triggered:', searchQuery);
      
      // Prepare filters for backend with current search
      const backendFilters = {
        ...filters,
        page: 1,
        limit: pageSize,
        search: searchQuery.trim()
      };

      // Handle date range presets
      if (filters.date_range !== 'all' && filters.date_range !== 'custom') {
        const dateRanges = getDateRange(filters.date_range);
        backendFilters.from_date = dateRanges.from;
        backendFilters.to_date = dateRanges.to;
      }

      // Clean empty filters
      Object.keys(backendFilters).forEach(key => {
        if (backendFilters[key] === '' || backendFilters[key] === 'all') {
          delete backendFilters[key];
        }
      });

      setIsLoading(true);
      setPagination(prev => ({ ...prev, current_page: 1 }));

      wsService.send({
        type: 'get_orders',
        filters: backendFilters
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, filters, pageSize]); // Include filters and pageSize in dependencies

  // Request initial data and set up real-time handlers
  useEffect(() => {
    console.log('Orders component mounted');
    
    // Load initial data
    loadOrders();

    // Set up real-time message handlers
    const handleOrdersData = (data: any) => {
      console.log('Received orders data:', data);
      try {
        setOrders(data.orders || []);
        
        // Update pagination info
        if (data.pagination) {
          setPagination({
            current_page: data.pagination.current_page || 1,
            total_pages: data.pagination.total_pages || 1,
            total_orders: data.pagination.total_orders || 0,
            has_next: data.pagination.has_next || false,
            has_prev: data.pagination.has_prev || false
          });
        }
        
        setIsLoading(false);
        setIsRefreshing(false);
      } catch (error) {
        console.error('Error processing orders data:', error);
        setOrders([]);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    };

    const handleDeliveryPartnersData = (data: any) => {
      console.log('Received delivery partners data:', data);
      setDeliveryPartners(data.delivery_partners || []);
    };

    const handleDeliveryRequestsData = (data: any) => {
      console.log('Received delivery requests data for order:', data);
      setDeliveryRequests(data.delivery_requests || []);
    };

    const handleOrderStatusHistory = (data: any) => {
      console.log('Received order status history:', data);
      setOrderStatusHistory(data.history || []);
    };

    const handleOrderUpdated = (data: any) => {
      console.log('Order updated:', data);
      setIsUpdating(false);
      // Reload current page to reflect changes
      loadOrders(pagination.current_page);
      toast({
        title: "Order Updated",
        description: "Order has been updated successfully",
      });
    };

    const handleOrderAssigned = (data: any) => {
      console.log('Order assigned:', data);
      setIsUpdating(false);
      setShowAssignModal(false);
      setSelectedDeliveryPartner("");
      setStatusNotes("");
      loadOrders(pagination.current_page);
      toast({
        title: "Order Assigned",
        description: "Order assigned to delivery partner successfully",
      });
    };

    const handleError = (data: any) => {
      console.error('Orders WebSocket error:', data);
      setIsLoading(false);
      setIsUpdating(false);
      setIsRefreshing(false);
      
      if (!data.message?.includes('Unknown message type') && 
          !data.message?.includes('not implemented')) {
        toast({
          title: "Error",
          description: data.message || "An error occurred",
          variant: "destructive",
        });
      }
    };

    // Register message handlers
    wsService.onMessage("orders_data", handleOrdersData);
    wsService.onMessage("delivery_partners_data", handleDeliveryPartnersData);
    wsService.onMessage("delivery_requests_data", handleDeliveryRequestsData);
    wsService.onMessage("order_status_history", handleOrderStatusHistory);
    wsService.onMessage("order_updated", handleOrderUpdated);
    wsService.onMessage("order_assigned", handleOrderAssigned);
    wsService.onMessage("error", handleError);

    return () => {
      wsService.onMessage("orders_data", () => {});
      wsService.onMessage("delivery_partners_data", () => {});
      wsService.onMessage("delivery_requests_data", () => {});
      wsService.onMessage("order_status_history", () => {});
      wsService.onMessage("order_updated", () => {});
      wsService.onMessage("order_assigned", () => {});
      wsService.onMessage("error", () => {});
    };
  }, []); // Remove dependencies that cause infinite loops

  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    setIsRefreshing(true);
    loadOrders(pagination.current_page);
    toast({
      title: "Refreshing Orders",
      description: "Loading latest order data...",
    });
  };

  const handleStatusChange = (orderId: string, newStatus: string) => {
    if (!orderId) {
      toast({
        title: "Error",
        description: "Invalid order ID",
        variant: "destructive",
      });
      return;
    }

    console.log(`Updating order ${orderId} status to ${newStatus}`);
    setIsUpdating(true);

    wsService.send({
      type: 'update_order_status',
      data: {
        order_id: orderId,
        status: newStatus,
        notes: statusNotes,
        delivery_partner: newStatus === 'out_for_delivery' ? selectedDeliveryPartner : undefined
      }
    });

    toast({
      title: "Updating Order Status",
      description: `Changing order ${orderId} status to ${newStatus}...`,
    });

    setStatusNotes("");
    setSelectedDeliveryPartner("");
  };

  const handleAssignDeliveryPartner = (orderId: string) => {
    if (!selectedDeliveryPartner) {
      toast({
        title: "Error",
        description: "Please select a delivery partner",
        variant: "destructive",
      });
      return;
    }

    console.log(`Assigning order ${orderId} to delivery partner ${selectedDeliveryPartner}`);
    setIsUpdating(true);

    wsService.send({
      type: 'assign_delivery_partner',
      data: {
        order_id: orderId,
        delivery_partner_id: selectedDeliveryPartner,
      }
    });

    toast({
      title: "Assigning Order",
      description: "Assigning order to delivery partner...",
    });
  };

  const handleViewOrder = (order: any) => {
    if (!order) {
      console.error('Cannot view order: order is null/undefined');
      return;
    }
    console.log('Viewing order:', order);
    setSelectedOrder(order);
    setShowOrderModal(true);
  };

  // FIX 3: Fixed handleViewOrderDetails function with explicit state management
  const handleViewOrderDetails = (order: any) => {
    if (!order) {
      console.error('Cannot view order details: order is null/undefined');
      return;
    }
    console.log('handleViewOrderDetails called with order:', order);
    console.log('Setting selectedOrder and opening drawer...');
    
    setSelectedOrder(order);
    
    // Ensure the drawer opens by explicitly setting the state
    setTimeout(() => {
      setShowOrderDrawer(true);
      console.log('Drawer state set to true');
    }, 0);
  };

  const openAssignModal = (order: any) => {
    setSelectedOrder(order);
    setSelectedDeliveryPartner("");
    setDeliveryRequests([]);
    
    console.log('Fetching delivery requests for order:', order.id);
    wsService.send({
      type: 'get_delivery_requests_for_order',
      data: { order_id: order.id }
    });
    
    setShowAssignModal(true);
  };

  const getStatusActions = (order: any) => {
    if (!order || !order.status) return [];
    
    const actions = [];
    
    try {
      switch (order.status) {
        case 'pending':
          actions.push(
            <Button
              key="confirm"
              size="sm"
              onClick={() => handleStatusChange(order.id, 'confirmed')}
              disabled={isUpdating}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirm
            </Button>
          );
          break;
        case 'confirmed':
          actions.push(
            <Button
              key="prepare"
              size="sm"
              onClick={() => handleStatusChange(order.id, 'preparing')}
              disabled={isUpdating}
            >
              <Clock className="h-4 w-4 mr-1" />
              Start Preparing
            </Button>
          );
          break;
        case 'preparing':
          actions.push(
            <Button
              key="assigning"
              size="sm"
              onClick={() => handleStatusChange(order.id, 'assigning')}
              disabled={isUpdating}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Mark Prepared
            </Button>
          );
          break;
        case 'accepted':
          actions.push(
            <Button
              key="assign"
              size="sm"
              variant="secondary"
              onClick={() => openAssignModal(order)}
              disabled={isUpdating}
            >
              <User className="h-4 w-4 mr-1" />
              Assign Partner
            </Button>
          );
          break;
      }
    } catch (error) {
      console.error('Error generating status actions for order:', order, error);
    }

    return actions;
  };

  // Count active filters
  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.status !== 'all') count++;
    if (filters.date_range !== 'all') count++;
    if (filters.delivery_partner !== 'all') count++;
    if (filters.min_amount) count++;
    if (filters.max_amount) count++;
    if (filters.customer_name) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">Manage customer orders and delivery status</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Management</CardTitle>
          <CardDescription>
            {isLoading ? "Loading orders..." : `${pagination.total_orders} total orders`}
          </CardDescription>
          
          {/* Enhanced Search and Filter Bar */}
          <div className="flex items-center justify-between space-x-4">
            <div className="flex items-center space-x-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders by ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
                disabled={isLoading}
              />
              
              {/* Quick Status Filter - FIXED: Auto-apply on change */}
              <Select 
                value={filters.status} 
                onValueChange={(value) => handleFilterChange('status', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Advanced Filters */}
              <Popover open={showFiltersPopover} onOpenChange={setShowFiltersPopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="relative">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    More Filters
                    {activeFiltersCount > 0 && (
                      <Badge variant="secondary" className="ml-2 px-1 py-0 text-xs">
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-4" align="start">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Advanced Filters</h4>
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="h-4 w-4 mr-1" />
                        Clear All
                      </Button>
                    </div>
                    
                    <Separator />
                    
                    {/* Date Range Filter */}
                    <div className="space-y-2">
                      <Label>Date Range</Label>
                      <Select 
                        value={filters.date_range} 
                        onValueChange={(value) => handleFilterChange('date_range', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dateRangeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom Date Range */}
                    {filters.date_range === 'custom' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>From Date</Label>
                          <Input
                            type="date"
                            value={filters.from_date}
                            onChange={(e) => handleFilterChange('from_date', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>To Date</Label>
                          <Input
                            type="date"
                            value={filters.to_date}
                            onChange={(e) => handleFilterChange('to_date', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Amount Range */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>Min Amount (₹)</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={filters.min_amount}
                          onChange={(e) => handleFilterChange('min_amount', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Amount (₹)</Label>
                        <Input
                          type="number"
                          placeholder="No limit"
                          value={filters.max_amount}
                          onChange={(e) => handleFilterChange('max_amount', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Customer Name Filter */}
                    {/* <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <Input
                        placeholder="Filter by customer name"
                        value={filters.customer_name}
                        onChange={(e) => handleFilterChange('customer_name', e.target.value)}
                      />
                    </div> */}

                    <Separator />
                    
                    <div className="flex space-x-2">
                      <Button onClick={applyFilters} className="flex-1">
                        <Filter className="h-4 w-4 mr-2" />
                        Apply Filters
                      </Button>
                      <Button variant="outline" onClick={() => setShowFiltersPopover(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center space-x-2">
              <Select value={pageSize.toString()} onValueChange={(value) => handlePageSizeChange(parseInt(value))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading orders...</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivery Partner</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length > 0 ? (
                    orders.map((order) => {
                      try {
                        return (
                          <TableRow key={order._id || order.id}>
                            <TableCell className="font-medium">
                              <Button 
                                variant="link" 
                                className="p-0 h-auto text-blue-600 hover:text-blue-800"
                                onClick={(e) => {
                                  e.preventDefault();
                                  console.log('Order ID clicked, opening drawer for order:', order);
                                  handleViewOrderDetails(order);
                                }}
                              >
                                #{order.id || 'N/A'}
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </TableCell>
                            <TableCell>{order.user_name || 'Unknown'}</TableCell>
                            <TableCell>₹{order.total || '0.00'}</TableCell>
                            <TableCell>
                              <StatusBadge status={order.status || 'pending'} />
                            </TableCell>
                            <TableCell>
                              {order.delivery_partner_name ? (
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  <span>{order.delivery_partner_name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Not assigned</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {order.created_at ? (
                                format(parseISO(order.created_at), "MMM dd, yyyy")
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {order.created_at ? (
                                format(parseISO(order.created_at), "HH:mm:ss")
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewOrder(order)}
                                  disabled={isUpdating}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {getStatusActions(order)}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      } catch (error) {
                        console.error('Error rendering order row:', order, error);
                        return (
                          <TableRow key={`error-${order._id || order.id || Math.random()}`}>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                              Error displaying order data
                            </TableCell>
                          </TableRow>
                        );
                      }
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No orders found matching your criteria.</p>
                        {activeFiltersCount > 0 && (
                          <Button variant="link" onClick={clearFilters} className="mt-2">
                            Clear filters to see all orders
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Enhanced Pagination */}
              {pagination.total_orders > 0 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="flex items-center space-x-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {Math.min(((pagination.current_page - 1) * pageSize) + 1, pagination.total_orders)} to{' '}
                      {Math.min(pagination.current_page * pageSize, pagination.total_orders)} of{' '}
                      {pagination.total_orders} orders
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(1)}
                      disabled={!pagination.has_prev || isLoading}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.current_page - 1)}
                      disabled={!pagination.has_prev || isLoading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>

                    <div className="flex items-center space-x-1">
                      <span className="text-sm font-medium">
                        Page {pagination.current_page} of {pagination.total_pages}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.current_page + 1)}
                      disabled={!pagination.has_next || isLoading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.total_pages)}
                      disabled={!pagination.has_next || isLoading}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Order Details Drawer */}
      <Sheet open={showOrderDrawer} onOpenChange={setShowOrderDrawer}>
        <SheetContent className="w-[800px] sm:w-[1000px] flex flex-col">
          <SheetHeader>
            <SheetTitle>Order Details - #{selectedOrder?.id || 'N/A'}</SheetTitle>
            <SheetDescription>
              Complete order information and status tracking
            </SheetDescription>
          </SheetHeader>
          
          {selectedOrder && (
            <div className="flex-1 overflow-y-auto space-y-6 py-6">
              {/* Order Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p><strong>Customer:</strong> {selectedOrder.user_name || 'N/A'}</p>
                      <p><strong>Status:</strong> <StatusBadge status={selectedOrder.status || 'pending'} /></p>
                    </div>
                    <div>
                      <p><strong>Total:</strong> ₹{selectedOrder.total || '0.00'}</p>
                      <p><strong>Created:</strong> {selectedOrder.created_at ? format(new Date(selectedOrder.created_at), "MMM dd, yyyy HH:mm:ss") : 'N/A'}</p>
                      <p><strong>Delivery Partner:</strong> {selectedOrder.delivery_partner_name || "Not assigned"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Customer & Delivery Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Customer Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> {selectedOrder.user_name || 'N/A'}</p>
                      <p><strong>Email:</strong> {selectedOrder.user_email || 'N/A'}</p>
                      <p><strong>Phone:</strong> {selectedOrder.user_phone || 'N/A'}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Delivery Address
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p>{selectedOrder.delivery_address?.address || "No address provided"}</p>
                      {selectedOrder.delivery_address?.city && (
                        <p>{selectedOrder.delivery_address.city}, {selectedOrder.delivery_address.state}</p>
                      )}
                      {selectedOrder.delivery_address?.pincode && (
                        <p>PIN: {selectedOrder.delivery_address.pincode}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Order Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items && Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                        selectedOrder.items.map((item: any, index: number) => {
                          try {
                            return (
                              <TableRow key={item.id || `item-${index}`}>
                                <TableCell>
                                  <div className="flex items-center space-x-3">
                                    {item.product_image?.[0] ? (
                                      <img
                                        src={item.product_image[0]}
                                        alt={item.product_name || 'Product'}
                                        className="h-10 w-10 rounded-lg object-cover"
                                      />
                                    ) : (
                                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                                        <Package className="h-5 w-5 text-muted-foreground" />
                                      </div>
                                    )}
                                    <span>{item.product_name || 'Unknown Product'}</span>
                                  </div>
                                </TableCell>
                                <TableCell>₹{item.price || '0.00'}</TableCell>
                                <TableCell>{item.quantity || 0}</TableCell>
                                <TableCell>₹{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          } catch (error) {
                            console.error('Error rendering order item:', item, error);
                            return (
                              <TableRow key={`error-item-${index}`}>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">
                                  Error displaying item
                                </TableCell>
                              </TableRow>
                            );
                          }
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4">
                            <p className="text-muted-foreground">No items found for this order</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Assign Delivery Partner Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Delivery Partner</DialogTitle>
            <DialogDescription>
              Select from delivery partners who requested order #{selectedOrder?.id}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {deliveryRequests.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="delivery-partner">Available Delivery Partners</Label>
                  <Select
                    value={selectedDeliveryPartner}
                    onValueChange={setSelectedDeliveryPartner}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select from requested partners" />
                    </SelectTrigger>
                    <SelectContent>
                    {deliveryRequests.map((partner,index) => (
                      <SelectItem key={`${partner.id}-${index}`} value={partner.id}>
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium">{partner.name}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Showing {deliveryRequests.length} delivery partner(s) who requested this order
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAssignModal(false)}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => handleAssignDeliveryPartner(selectedOrder?.id)}
                    disabled={isUpdating || !selectedDeliveryPartner}
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <Truck className="mr-2 h-4 w-4" />
                        Assign Partner
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No delivery requests found</p>
                <p className="text-sm text-muted-foreground">
                  No delivery partners have requested this order yet. Please wait for requests or check back later.
                </p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setShowAssignModal(false)}
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Original Order Details Modal (simplified) */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details - #{selectedOrder?.id || 'N/A'}</DialogTitle>
            <DialogDescription>
              Quick view of order information
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Customer Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> {selectedOrder.user_name || 'N/A'}</p>
                      <p><strong>Email:</strong> {selectedOrder.user_email || 'N/A'}</p>
                      <p><strong>Phone:</strong> {selectedOrder.user_phone || 'N/A'}</p>
                      <p><strong>Order Date:</strong> {
                        selectedOrder.created_at ? 
                          format(new Date(selectedOrder.created_at), "MMM dd, yyyy HH:mm:ss") : 
                          'N/A'
                      }</p>
                      <p><strong>Total:</strong> ₹{selectedOrder.total || '0.00'}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Status & Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p><strong>Status:</strong> <StatusBadge status={selectedOrder.status || 'pending'} /></p>
                      <p><strong>Delivery Partner:</strong> {selectedOrder.delivery_partner_name || "Not assigned"}</p>
                      
                      <div className="space-y-2">
                        <Label htmlFor="status-notes">Notes (optional)</Label>
                        <Textarea
                          id="status-notes"
                          placeholder="Add any notes about the status change..."
                          value={statusNotes}
                          onChange={(e) => setStatusNotes(e.target.value)}
                          disabled={isUpdating}
                        />
                      </div>
                      
                      <div className="flex space-x-2">
                        {getStatusActions(selectedOrder)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}