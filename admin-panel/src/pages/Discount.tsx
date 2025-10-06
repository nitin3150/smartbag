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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useDashboardStore } from "@/store/dashboardStore";
import { wsService } from "@/services/websocket";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Ticket, 
  Users, 
  UserCheck, 
  UserPlus, 
  Calendar, 
  Percent,
  DollarSign,
  Copy,
  Eye,
  EyeOff,
  Filter,
  Download,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { dataTagErrorSymbol } from "@tanstack/react-query";

// Define interfaces
interface DiscountCoupon {
  _id: string;
  id: string;
  code: string;
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  usage_limit: number;
  usage_count: number;
  user_usage_limit: number;
  valid_from: string;
  valid_until: string;
  target_audience: 'all_users' | 'new_users' | 'existing_users' | 'specific_users';
  specific_users?: string[];
  specific_user_details?: Array<{
    user_id: string;
    name: string;
    email: string;
  }>;
  categories?: string[];
  products?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface CouponFormData {
  code: string;
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: string;
  min_order_amount: string;
  max_discount_amount: string;
  usage_limit: string;
  user_usage_limit: string;
  valid_from: string;
  valid_until: string;
  target_audience: 'all_users' | 'new_users' | 'existing_users' | 'specific_users';
  specific_users: string[];
  categories: string[];
  products: string[];
  is_active: boolean;
}

export default function DiscountCoupons() {
  const { users } = useDashboardStore();
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<DiscountCoupon[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<DiscountCoupon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // User search for specific users selection
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Array<{user_id: string, name: string, email: string}>>([]);
  
  const [formData, setFormData] = useState<CouponFormData>({
    code: "",
    title: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    min_order_amount: "",
    max_discount_amount: "",
    usage_limit: "",
    user_usage_limit: "1",
    valid_from: "",
    valid_until: "",
    target_audience: "all_users",
    specific_users: [],
    categories: [],
    products: [],
    is_active: true,
  });

  const statusOptions = [
    { value: "all", label: "All Coupons" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "expired", label: "Expired" },
  ];

  const audienceOptions = [
    { value: "all", label: "All Audiences" },
    { value: "all_users", label: "All Users" },
    { value: "new_users", label: "New Users Only" },
    { value: "existing_users", label: "Existing Users Only" },
    { value: "specific_users", label: "Specific Users" },
  ];

  // Request initial data and set up real-time handlers
  useEffect(() => {
    console.log('Discount Coupons component mounted, requesting data...');
    
    wsService.send({
      type: 'get_discount_coupons'
    });

    // Also request users data for specific user selection
    wsService.send({
      type: 'get_users',
      filters: {}
    });
    // console.log(data)
    const handleCouponsData = (data: any) => {
      console.log('Received coupons data:', data);
      setCoupons(data.data || []);
      setIsLoading(false);
    };

    const handleCouponCreated = (data: any) => {
      console.log('Coupon created:', data);
      wsService.send({ type: 'get_discount_coupons' });
      setIsSaving(false);
      toast({
        title: "Coupon Created",
        description: "New discount coupon has been created successfully",
      });
    };

    const handleCouponUpdated = (data: any) => {
      console.log('Coupon updated:', data);
      wsService.send({ type: 'get_discount_coupons' });
      setIsSaving(false);
      toast({
        title: "Coupon Updated",
        description: "Discount coupon has been updated successfully",
      });
    };

    const handleCouponDeleted = (data: any) => {
      console.log('Coupon deleted:', data);
      wsService.send({ type: 'get_discount_coupons' });
      setIsSaving(false);
      toast({
        title: "Coupon Deleted",
        description: "Discount coupon has been deleted successfully",
      });
    };

    const handleError = (data: any) => {
      console.error('WebSocket error:', data);
      setIsLoading(false);
      setIsSaving(false);
      toast({
        title: "Error",
        description: data.message || "An error occurred",
        variant: "destructive",
      });
    };

    // Register message handlers
    wsService.onMessage("coupons_data", handleCouponsData);
    wsService.onMessage("discount_coupons_data", handleCouponsData);
    wsService.onMessage("coupon_created", handleCouponCreated);
    wsService.onMessage("coupon_updated", handleCouponUpdated);
    wsService.onMessage("coupon_deleted", handleCouponDeleted);
    wsService.onMessage("error", handleError);

    return () => {
      wsService.onMessage("coupons_data", () => {});
      wsService.onMessage("discount_coupons_data", () => {});
      wsService.onMessage("coupon_created", () => {});
      wsService.onMessage("coupon_updated", () => {});
      wsService.onMessage("coupon_deleted", () => {});
      wsService.onMessage("error", () => {});
    };
  }, [toast]);

  const filteredCoupons = coupons.filter(coupon => {
    const searchTerm = searchQuery.toLowerCase();
    const matchesSearch = (coupon.code || '').toLowerCase().includes(searchTerm) ||
                         (coupon.title || '').toLowerCase().includes(searchTerm) ||
                         (coupon.description || '').toLowerCase().includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && coupon.is_active && new Date(coupon.valid_until) > new Date()) ||
      (statusFilter === "inactive" && !coupon.is_active) ||
      (statusFilter === "expired" && new Date(coupon.valid_until) <= new Date());
    
    const matchesAudience = audienceFilter === "all" || coupon.target_audience === audienceFilter;
    
    return matchesSearch && matchesStatus && matchesAudience;
  });

  // Filter users for search
  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(userSearchQuery.toLowerCase())
  ).filter(user => 
    // Don't show already selected users
    !selectedUsers.find(selected => selected.user_id === (user._id || user.id))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Submitting coupon form:', formData);
    console.log('Selected users:', selectedUsers);
    
    try {
      const couponData = {
        code: formData.code.toUpperCase(),
        title: formData.title,
        description: formData.description,
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value),
        min_order_amount: parseFloat(formData.min_order_amount) || 0,
        max_discount_amount: formData.max_discount_amount ? parseFloat(formData.max_discount_amount) : null,
        usage_limit: parseInt(formData.usage_limit) || 0,
        user_usage_limit: parseInt(formData.user_usage_limit) || 1,
        valid_from: formData.valid_from,
        valid_until: formData.valid_until,
        target_audience: formData.target_audience,
        specific_users: formData.target_audience === 'specific_users' ? selectedUsers.map(u => u.user_id) : [],
        specific_user_details: formData.target_audience === 'specific_users' ? selectedUsers : [],
        categories: formData.categories,
        products: formData.products,
        is_active: formData.is_active,
      };

      setIsSaving(true);

      if (editingCoupon) {
        wsService.send({
          type: 'update_discount_coupon',
          data: { _id: editingCoupon._id || editingCoupon.id, ...couponData }
        });
        toast({
          title: "Updating Coupon",
          description: "Please wait...",
        });
      } else {
        wsService.send({
          type: 'create_discount_coupon',
          data: couponData
        });
        toast({
          title: "Creating Coupon",
          description: "Please wait...",
        });
      }

      // Reset form
      resetForm();
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setIsSaving(false);
      toast({
        title: "Error",
        description: "Failed to process request",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (coupon: DiscountCoupon) => {
    console.log('Editing coupon:', coupon);
    
    try {
      setEditingCoupon(coupon);
      setFormData({
        code: coupon.code || "",
        title: coupon.title || "",
        description: coupon.description || "",
        discount_type: coupon.discount_type || "percentage",
        discount_value: coupon.discount_value?.toString() || "",
        min_order_amount: coupon.min_order_amount?.toString() || "",
        max_discount_amount: coupon.max_discount_amount?.toString() || "",
        usage_limit: coupon.usage_limit?.toString() || "",
        user_usage_limit: coupon.user_usage_limit?.toString() || "1",
        valid_from: coupon.valid_from ? coupon.valid_from.split('T')[0] : "",
        valid_until: coupon.valid_until ? coupon.valid_until.split('T')[0] : "",
        target_audience: coupon.target_audience || "all_users",
        specific_users: coupon.specific_users || [],
        categories: coupon.categories || [],
        products: coupon.products || [],
        is_active: coupon.is_active !== undefined ? coupon.is_active : true,
      });
      
      // Set selected users if editing specific users coupon
      if (coupon.target_audience === 'specific_users' && coupon.specific_user_details) {
        setSelectedUsers(coupon.specific_user_details);
      } else {
        setSelectedUsers([]);
      }
      
      setShowAddModal(true);
    } catch (error) {
      console.error('Error in handleEdit:', error);
      toast({
        title: "Error",
        description: "Failed to load coupon data for editing",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (couponId: string) => {
    if (confirm("Are you sure you want to delete this discount coupon?")) {
      setIsSaving(true);
      wsService.send({
        type: 'delete_discount_coupon',
        data: { _id: couponId }
      });
      toast({
        title: "Deleting Coupon",
        description: "Please wait...",
      });
    }
  };

  const handleToggleStatus = (couponId: string, currentStatus: boolean) => {
    setIsSaving(true);
    wsService.send({
      type: 'toggle_coupon_status',
      data: { 
        _id: couponId, 
        is_active: !currentStatus 
      }
    });
    toast({
      title: currentStatus ? "Deactivating Coupon" : "Activating Coupon",
      description: "Please wait...",
    });
  };

  const generateCouponCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    setFormData({ ...formData, code: result });
  };

  const addUserToSelection = (user: any) => {
    const newUser = {
      user_id: user._id || user.id,
      name: user.name || user.email,
      email: user.email
    };
    setSelectedUsers([...selectedUsers, newUser]);
    setUserSearchQuery("");
  };

  const removeUserFromSelection = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(user => user.user_id !== userId));
  };

  const resetForm = () => {
    setEditingCoupon(null);
    setSelectedUsers([]);
    setUserSearchQuery("");
    setFormData({
      code: "",
      title: "",
      description: "",
      discount_type: "percentage",
      discount_value: "",
      min_order_amount: "",
      max_discount_amount: "",
      usage_limit: "",
      user_usage_limit: "1",
      valid_from: "",
      valid_until: "",
      target_audience: "all_users",
      specific_users: [],
      categories: [],
      products: [],
      is_active: true,
    });
    setShowAddModal(false);
  };

  const handleModalClose = (open: boolean) => {
    setShowAddModal(open);
    if (!open) {
      resetForm();
    }
  };

  const copyCouponCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copied!",
      description: `Coupon code "${code}" copied to clipboard`,
    });
  };

  const getCouponStats = () => {
    const total = coupons.length;
    const active = coupons.filter(c => c.is_active && new Date(c.valid_until) > new Date()).length;
    const expired = coupons.filter(c => new Date(c.valid_until) <= new Date()).length;
    const totalUsage = coupons.reduce((sum, c) => sum + (c.usage_count || 0), 0);
    
    return { total, active, expired, totalUsage };
  };

  const stats = getCouponStats();

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Ticket className="h-8 w-8" />
            Discount Coupons
          </h1>
          <p className="text-muted-foreground">Create and manage discount coupons for your customers</p>
        </div>
        <Dialog open={showAddModal} onOpenChange={handleModalClose}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCoupon ? "Edit Discount Coupon" : "Create New Discount Coupon"}</DialogTitle>
              <DialogDescription>
                {editingCoupon ? "Update coupon details and settings" : "Set up a new discount coupon for your customers"}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Coupon Code</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="code"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        placeholder="SAVE20"
                        required
                      />
                      <Button type="button" variant="outline" onClick={generateCouponCode}>
                        Generate
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Summer Sale 20% Off"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Get 20% discount on your order. Valid until end of summer."
                    rows={3}
                  />
                </div>
              </div>

              <Separator />

              {/* Discount Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Discount Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="discount_type">Discount Type</Label>
                    <Select
                      value={formData.discount_type}
                      onValueChange={(value: 'percentage' | 'fixed_amount') => 
                        setFormData({ ...formData, discount_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed_amount">Fixed Amount (₹)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discount_value">
                      {formData.discount_type === 'percentage' ? 'Discount Percentage' : 'Discount Amount (₹)'}
                    </Label>
                    <Input
                      id="discount_value"
                      type="number"
                      step={formData.discount_type === 'percentage' ? "0.1" : "0.01"}
                      value={formData.discount_value}
                      onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                      placeholder={formData.discount_type === 'percentage' ? "20" : "100"}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min_order_amount">Minimum Order Amount (₹)</Label>
                    <Input
                      id="min_order_amount"
                      type="number"
                      step="0.01"
                      value={formData.min_order_amount}
                      onChange={(e) => setFormData({ ...formData, min_order_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  {formData.discount_type === 'percentage' && (
                    <div className="space-y-2">
                      <Label htmlFor="max_discount_amount">Maximum Discount Amount (₹)</Label>
                      <Input
                        id="max_discount_amount"
                        type="number"
                        step="0.01"
                        value={formData.max_discount_amount}
                        onChange={(e) => setFormData({ ...formData, max_discount_amount: e.target.value })}
                        placeholder="No limit"
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Usage Limits & Validity */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Usage Limits & Validity</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="usage_limit">Total Usage Limit</Label>
                    <Input
                      id="usage_limit"
                      type="number"
                      value={formData.usage_limit}
                      onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                      placeholder="0 = Unlimited"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user_usage_limit">Per User Usage Limit</Label>
                    <Input
                      id="user_usage_limit"
                      type="number"
                      value={formData.user_usage_limit}
                      onChange={(e) => setFormData({ ...formData, user_usage_limit: e.target.value })}
                      placeholder="1"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valid_from">Valid From</Label>
                    <Input
                      id="valid_from"
                      type="date"
                      value={formData.valid_from}
                      onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valid_until">Valid Until</Label>
                    <Input
                      id="valid_until"
                      type="date"
                      value={formData.valid_until}
                      onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Target Audience */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Target Audience</h3>
                <div className="space-y-2">
                  <Label htmlFor="target_audience">Who can use this coupon?</Label>
                  <Select
                    value={formData.target_audience}
                    onValueChange={(value: any) => {
                      setFormData({ ...formData, target_audience: value });
                      if (value !== 'specific_users') {
                        setSelectedUsers([]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_users">All Users</SelectItem>
                      <SelectItem value="new_users">New Users Only</SelectItem>
                      <SelectItem value="existing_users">Existing Users Only</SelectItem>
                      <SelectItem value="specific_users">Specific Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Specific Users Selection */}
                {formData.target_audience === 'specific_users' && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      <Label>Select Specific Users</Label>
                    </div>
                    
                    {/* User Search */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users by name or email..."
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      
                      {/* Search Results */}
                      {userSearchQuery && (
                        <div className="max-h-40 overflow-y-auto border rounded-md">
                          {filteredUsers.length > 0 ? (
                            filteredUsers.slice(0, 5).map((user) => (
                              <div
                                key={user._id || user.id}
                                className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                                onClick={() => addUserToSelection(user)}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{user.name || user.email}</p>
                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                  </div>
                                  <UserPlus className="h-4 w-4" />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-3 text-center text-muted-foreground">
                              No users found matching "{userSearchQuery}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Selected Users */}
                    {selectedUsers.length > 0 && (
                      <div className="space-y-2">
                        <Label>Selected Users ({selectedUsers.length})</Label>
                        <div className="max-h-32 overflow-y-auto space-y-2">
                          {selectedUsers.map((user) => (
                            <div key={user.user_id} className="flex items-center justify-between p-2 bg-muted rounded">
                              <div className="flex items-center gap-2">
                                <UserCheck className="h-4 w-4" />
                                <div>
                                  <p className="text-sm font-medium">{user.name}</p>
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeUserFromSelection(user.user_id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedUsers.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No users selected. Use the search above to find and select specific users.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Status */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="is_active">Coupon Status</Label>
                  <p className="text-sm text-muted-foreground">
                    {formData.is_active ? "Coupon is active and can be used" : "Coupon is inactive and cannot be used"}
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => handleModalClose(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {editingCoupon ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      {editingCoupon ? "Update Coupon" : "Create Coupon"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Coupons</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All coupons</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Coupons</CardTitle>
            <Percent className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <Calendar className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
            <p className="text-xs text-muted-foreground">Expired coupons</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Usage</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.totalUsage}</div>
            <p className="text-xs text-muted-foreground">Times used</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coupon Management</CardTitle>
          <CardDescription>
            {isLoading ? "Loading coupons..." : `${filteredCoupons.length} coupons found`}
          </CardDescription>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search coupons..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
                disabled={isLoading}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isLoading}>
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
            <Select value={audienceFilter} onValueChange={setAudienceFilter} disabled={isLoading}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audienceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading coupons...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Target Audience</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCoupons.map((coupon) => {
                  
                  const isExpired = coupon.valid_until.split('T')[0] < new Date().toISOString().split('T')[0];
                  // const isExpired = new Date(coupon.valid_until) <= new Date();
                  const usagePercentage = coupon.usage_limit ? 
                    (coupon.usage_count / coupon.usage_limit) * 100 : 0;
                  
                  return (
                    <TableRow key={coupon._id || coupon.id}>
                      <TableCell className="font-mono">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{coupon.code}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyCouponCode(coupon.code)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{coupon.title}</p>
                          {coupon.description && (
                            <p className="text-sm text-muted-foreground truncate max-w-xs">
                              {coupon.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {coupon.discount_type === 'percentage' 
                            ? `${coupon.discount_value}%` 
                            : `₹${coupon.discount_value}`
                          }
                        </Badge>
                        {coupon.min_order_amount > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Min: ₹{coupon.min_order_amount}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {coupon.target_audience === 'all_users' && <Users className="h-4 w-4" />}
                          {coupon.target_audience === 'new_users' && <UserPlus className="h-4 w-4" />}
                          {coupon.target_audience === 'existing_users' && <UserCheck className="h-4 w-4" />}
                          {coupon.target_audience === 'specific_users' && <Filter className="h-4 w-4" />}
                          <span className="text-sm">
                            {audienceOptions.find(opt => opt.value === coupon.target_audience)?.label}
                          </span>
                        </div>
                        {coupon.target_audience === 'specific_users' && (
                          <p className="text-xs text-muted-foreground">
                            {coupon.specific_users?.length || 0} users
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">
                            {coupon.usage_count || 0}
                            {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' uses'}
                          </p>
                          {coupon.usage_limit && (
                            <div className="w-full bg-muted rounded-full h-1 mt-1">
                              <div 
                                className="bg-primary h-1 rounded-full transition-all"
                                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      {/* <TableCell>
                        <div className={isExpired ? 'text-red-600' : ''}>
                          {format(new Date(coupon.valid_until), "MMM dd, yyyy")}
                        </div>
                      </TableCell> */}
                      <TableCell>
                        <div className={isExpired ? 'text-red-600' : ''}>
                          {new Date(coupon.valid_until + 'T00:00:00Z').toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric', 
                            year: 'numeric',
                            timeZone: 'UTC'
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={
                            !coupon.is_active ? 'inactive' : 
                            isExpired ? 'expired' : 'active'
                          } />
                          <Switch
                            checked={coupon.is_active && !isExpired}
                            onCheckedChange={() => handleToggleStatus(coupon._id || coupon.id, coupon.is_active)}
                            disabled={isExpired || isSaving}
                            size="sm"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(coupon)}
                            disabled={isSaving}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(coupon._id || coupon.id)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          
          {!isLoading && filteredCoupons.length === 0 && (
            <div className="text-center py-8">
              <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No discount coupons found matching your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}