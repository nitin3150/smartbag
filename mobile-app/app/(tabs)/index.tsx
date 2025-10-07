import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  FlatList,
  RefreshControl,
  Alert,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { API_BASE_URL, IMAGE_BASE_URL, API_ENDPOINTS } from '../../config/apiConfig';
import { useAuth } from '../../contexts/AuthContext';

import { RequestProductSection, RequestProductRef } from '../../components/RequestProductSection';

const { width } = Dimensions.get('window');

interface ProductImage {
  url?: string;
  secure_url?: string;
  thumbnail?: string;
  public_id?: string;
}

interface Product {
  _id: string;
  id: string;
  name: string;
  description: string;
  price: number;
  images: (string | ProductImage)[];
  category: { 
    _id: string;
    id: string;
    name: string;
  };
  brand: { 
    _id: string;
    id: string;
    name: string;
  };
  stock: number;
  status: string;
}

interface Category {
  _id: string;
  id: string;
  name: string;
  icon?: string;
  image?: string;
  status: string;
}

interface CartQuantities {
  [productId: string]: number;
}

// Animated Logo Component
const AnimatedLogo = () => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const startAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startAnimation();
  }, [scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.logoContainer,
        {
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <Image
        source={require('../../assets/icon.png')}
        style={styles.loadingLogo}
        resizeMode="contain"
      />
    </Animated.View>
  );
};

const HomeScreen = () => {
  const { user, token, loading: authLoading } = useAuth();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [showCartNotification, setShowCartNotification] = useState(false);
  const [userAddress, setUserAddress] = useState<string>('Add Address');
  
  const [cartQuantities, setCartQuantities] = useState<CartQuantities>({});
  const [addingToCart, setAddingToCart] = useState<{[key: string]: boolean}>({});
  
  const initialDataFetched = useRef(false);
  const lastFetchTime = useRef(0);
  const isFetching = useRef(false);
  const requestFormRef = useRef<RequestProductRef>(null);

  const fetchData = useCallback(async () => {
    if (isFetching.current) {
      console.log('Fetch already in progress, skipping...');
      return;
    }
    
    const now = Date.now();
    if (now - lastFetchTime.current < 2000) {
      console.log('Too soon since last fetch, skipping...');
      return;
    }
    
    try {
      isFetching.current = true;
      lastFetchTime.current = now;
      setLoading(true);
      
      console.log('🔄 Fetching initial data...');
      const timestamp = Date.now();
      
      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.PRODUCTS}?_t=${timestamp}`),
        fetch(`${API_ENDPOINTS.CATEGORIES}?_t=${timestamp}`),
      ]);
      
      if (!productsRes.ok || !categoriesRes.ok) {
        throw new Error(`HTTP Error - Products: ${productsRes.status}, Categories: ${categoriesRes.status}`);
      }
      
      const productsData = await productsRes.json();
      const categoriesData = await categoriesRes.json();
      
      let productsArray: Product[] = [];
      if (productsData.products && Array.isArray(productsData.products)) {
        productsArray = productsData.products;
      } else if (Array.isArray(productsData)) {
        productsArray = productsData;
      }
      
      let categoriesArray: Category[] = [];
      if (categoriesData.categories && Array.isArray(categoriesData.categories)) {
        categoriesArray = categoriesData.categories;
      } else if (Array.isArray(categoriesData)) {
        categoriesArray = categoriesData;
      }
      
      const activeProducts = productsArray.filter(product => 
        product.status === 'active' || product.status === undefined
      );
      const activeCategories = categoriesArray.filter(category => 
        category.status === 'active' || category.status === undefined
      );
      
      console.log('✅ Data fetched successfully:', {
        products: activeProducts.length,
        categories: activeCategories.length
      });
      
      setProducts(activeProducts);
      setFilteredProducts(activeProducts);
      setCategories(activeCategories);
      initialDataFetched.current = true;
      
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      Alert.alert('Error', `Failed to load data: ${error.message}`);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  const fetchFilteredProducts = useCallback(async (search: string = '', categoryId: string | null = null) => {
    if (isFetching.current) return;
    
    try {
      isFetching.current = true;
      console.log('🔍 Fetching filtered products:', { search, categoryId });
      
      // If filtering locally (category selected), don't fetch from backend
      if (categoryId && !search) {
        console.log('🎯 Filtering locally by category:', categoryId);
        const filtered = products.filter(product => {
          if (typeof product.category === 'object') {
            return product.category.id === categoryId;
          }
          return product.category === categoryId;
        });
        console.log('✅ Local filter result:', filtered.length, 'products');
        setFilteredProducts(filtered);
        isFetching.current = false;
        return;
      }
      
      // For search, fetch from backend
      const timestamp = Date.now();
      let productsUrl = `${API_ENDPOINTS.PRODUCTS}?_t=${timestamp}`;
      
      if (search) {
        productsUrl += `&search=${encodeURIComponent(search)}`;
      }
      if (categoryId) {
        productsUrl += `&category=${encodeURIComponent(categoryId)}`;
      }
  
      const response = await fetch(productsUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const productsData = await response.json();
      
      let productsArray: Product[] = [];
      if (productsData.products && Array.isArray(productsData.products)) {
        productsArray = productsData.products;
      } else if (Array.isArray(productsData)) {
        productsArray = productsData;
      }
      
      const activeProducts = productsArray.filter(product => 
        product.status === 'active' || product.status === undefined
      );
      
      console.log('✅ Backend search result:', activeProducts.length, 'products');
      setFilteredProducts(activeProducts);
      
    } catch (error) {
      console.error('❌ Error fetching filtered products:', error);
    } finally {
      isFetching.current = false;
    }
  }, [products]); // Add products as dependency

  const fetchCartCount = useCallback(async () => {
    if (!token) {
      setCartCount(0);
      setCartQuantities({});
      return;
    }
    
    try {
      const response = await fetch(API_ENDPOINTS.CART, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const cartData = await response.json();
        const items = cartData.items || [];
        setCartCount(items.length);
        
        const quantities: CartQuantities = {};
        items.forEach((item: any) => {
          if (item.product && item.product.id) {
            quantities[item.product.id] = item.quantity;
          }
        });
        setCartQuantities(quantities);
      } else {
        setCartCount(0);
        setCartQuantities({});
      }
    } catch (error) {
      console.error('Error fetching cart count:', error);
      setCartCount(0);
      setCartQuantities({});
    }
  }, [token]);

  const fetchUserAddress = useCallback(async () => {
    if (!token) {
      setUserAddress('Add Address');
      return;
    }
    
    try {
      const profileResponse = await fetch(`${API_BASE_URL}address/my`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (profileResponse.ok) {
        const userData = await profileResponse.json();
        let displayAddress = null;
        
        if (Array.isArray(userData)) {
          const defaultAddress = userData.find(addr => addr.is_default) || userData[0];
          if (defaultAddress) {
            const addressParts = [];
            if (defaultAddress.street) addressParts.push(defaultAddress.street);
            if (defaultAddress.city) addressParts.push(defaultAddress.city);
            if (defaultAddress.state) addressParts.push(defaultAddress.state);
            if (defaultAddress.pincode) addressParts.push(defaultAddress.pincode);
            
            if (addressParts.length > 0) {
              displayAddress = addressParts.join(', ');
            }
          }
        }
        
        if (displayAddress) {
          if (displayAddress.length > 30) {
            displayAddress = displayAddress.substring(0, 27) + '...';
          }
          setUserAddress(displayAddress);
        } else {
          setUserAddress('Add Address');
        }
      } else {
        setUserAddress('Add Address');
      }
      
    } catch (error) {
      console.error('Error fetching user address:', error);
      setUserAddress('Add Address');
    }
  }, [token]);

  const addToCart = useCallback(async (productId: string) => {
    if (!token) {
      Alert.alert(
        'Login Required',
        'Please login to add items to your cart',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/auth/login') }
        ]
      );
      return;
    }

    const product = [...products, ...filteredProducts].find(p => p.id === productId);
    if (!product) {
      Alert.alert('Error', 'Product not found');
      return;
    }

    if (product.stock === 0) {
      Alert.alert('Error', 'Product is out of stock');
      return;
    }

    setAddingToCart(prev => ({ ...prev, [productId]: true }));

    try {
      const response = await fetch(API_ENDPOINTS.CART_ADD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          productId: productId,
          quantity: 1 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCartQuantities(prev => ({
          ...prev,
          [productId]: (prev[productId] || 0) + 1
        }));
        
        setCartCount(prev => prev + 1);
        setShowCartNotification(true);
        setTimeout(() => setShowCartNotification(false), 2000);
      } else {
        if (response.status === 401) {
          Alert.alert('Session Expired', 'Please login again');
        } else {
          Alert.alert('Error', data.message || 'Failed to add to cart');
        }
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert('Error', 'Failed to add to cart');
    } finally {
      setAddingToCart(prev => ({ ...prev, [productId]: false }));
    }
  }, [token, products, filteredProducts]);

  const updateCartQuantity = useCallback(async (productId: string, newQuantity: number) => {
    if (!token) {
      Alert.alert('Error', 'Please login to manage cart');
      return;
    }

    setAddingToCart(prev => ({ ...prev, [productId]: true }));

    try {
      const cartResponse = await fetch(API_ENDPOINTS.CART, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!cartResponse.ok) {
        throw new Error('Failed to fetch cart');
      }
      
      const cartData = await cartResponse.json();
      const cartItem = cartData.items?.find((item: any) => item.product?.id === productId);
      
      if (!cartItem) {
        console.log('Cart item not found for product:', productId);
        setAddingToCart(prev => ({ ...prev, [productId]: false }));
        return;
      }

      if (newQuantity <= 0) {
        const response = await fetch(`${API_ENDPOINTS.CART_REMOVE}?item_id=${cartItem._id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          setCartQuantities(prev => {
            const updated = { ...prev };
            delete updated[productId];
            return updated;
          });
          setCartCount(prev => Math.max(0, prev - (cartQuantities[productId] || 0)));
        } else {
          const errorData = await response.json();
          Alert.alert('Error', errorData.message || 'Failed to remove item');
        }
      } else {
        const response = await fetch(API_ENDPOINTS.CART_UPDATE, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ itemId: cartItem._id, quantity: newQuantity }),
        });

        if (response.ok) {
          const oldQuantity = cartQuantities[productId] || 0;
          const quantityDiff = newQuantity - oldQuantity;
          
          setCartQuantities(prev => ({
            ...prev,
            [productId]: newQuantity
          }));
          
          setCartCount(prev => prev + quantityDiff);
        } else {
          const errorData = await response.json();
          Alert.alert('Error', errorData.message || 'Failed to update quantity');
        }
      }
    } catch (error) {
      console.error('Error updating cart:', error);
      Alert.alert('Error', 'Failed to update cart');
    } finally {
      setAddingToCart(prev => ({ ...prev, [productId]: false }));
    }
  }, [token, cartQuantities]);

  // Debug effect to log data after it's loaded
  useEffect(() => {
    if (products.length > 0 && categories.length > 0) {
      console.log(`\n📊 ========== DATA LOADED SUMMARY ==========`);
      console.log(`Products: ${products.length}`);
      console.log(`Categories: ${categories.length}`);
      console.log(`\n📦 Sample Product:`, JSON.stringify(products[0], null, 2));
      console.log(`\n📁 Sample Category:`, JSON.stringify(categories[0], null, 2));
      console.log(`\n🔗 Product-Category Mapping:`);
      products.forEach(p => {
        console.log(`  ${p.name} -> Category: ${typeof p.category === 'object' ? p.category.id : p.category}`);
      });
      console.log(`========================================\n`);
    }
  }, [products, categories]);

  useEffect(() => {
    if (!initialDataFetched.current && !isFetching.current) {
      console.log('🚀 Initial data fetch triggered');
      fetchData();
    }
  }, [fetchData]);

  useEffect(() => {
    if (!authLoading) {
      console.log('🔐 Auth state changed, fetching user data');
      fetchCartCount();
      fetchUserAddress();
    }
  }, [authLoading, fetchCartCount, fetchUserAddress]);

  useFocusEffect(
    useCallback(() => {
      if (token && !authLoading) {
        fetchCartCount();
      }
    }, [token, authLoading, fetchCartCount])
  );

  useEffect(() => {
    if (!initialDataFetched.current) return;
    
    const handler = setTimeout(() => {
      if (searchQuery.length === 0 || searchQuery.length > 2) {
        console.log('🔍 Search/filter triggered:', { searchQuery, selectedCategory });
        fetchFilteredProducts(searchQuery, selectedCategory);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [searchQuery, selectedCategory, fetchFilteredProducts]);

  const extractProductIdFromImages = (product: Product): string | null => {
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      
      if (typeof firstImage === 'object' && firstImage.public_id) {
        const match = firstImage.public_id.match(/product_([a-f0-9]{24})_/);
        if (match) {
          return match[1];
        }
      }
    }
    
    return null;
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    initialDataFetched.current = false;
    await fetchData();
    await fetchCartCount();
    await fetchUserAddress();
    setRefreshing(false);
  }, [fetchData, fetchCartCount, fetchUserAddress]);

  const retryConnection = useCallback(() => {
    initialDataFetched.current = false;
    fetchData();
  }, [fetchData]);

  const handleProductPress = (product: Product) => {
    const productId = product.id;
    
    if (!productId) {
      Alert.alert('Error', 'Product ID not found');
      return;
    }
    
    router.push(`/product/${productId}`);
  };

  const handleCategoryPress = useCallback((categoryId: string | null) => {
    console.log('📂 Category pressed:', categoryId);
    setSelectedCategory(categoryId);
  }, []);

  const handleViewAllPress = useCallback((categoryId: string) => {
    console.log('👀 View all pressed for category:', categoryId);
    setSelectedCategory(categoryId);
  }, []);

  const handleCartPress = useCallback(() => {
    if (authLoading) {
      Alert.alert('Please wait', 'Checking login status...');
      return;
    }
    if (!token) {
      Alert.alert(
        'Login Required',
        'Please login to view your cart',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/auth/login') }
        ]
      );
      return;
    }
    router.push('/(tabs)/explore');
  }, [authLoading, token]);

  const getImageUrl = useCallback((images: (string | ProductImage)[]): string => {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return 'https://via.placeholder.com/150?text=No+Image';
    }
    
    const firstImage = images[0];
    
    if (typeof firstImage === 'string') {
      return firstImage.startsWith('http') ? firstImage : `${IMAGE_BASE_URL}${firstImage}`;
    }
    
    if (typeof firstImage === 'object' && firstImage !== null) {
      const url = firstImage.url || firstImage.secure_url || firstImage.thumbnail;
      if (url) {
        return url;
      }
    }
    
    return 'https://via.placeholder.com/150?text=No+Image';
  }, []);

  const getCategoryIconUrl = useCallback((category: Category): string => {
    const iconSource = category.icon || category.image;
    
    if (!iconSource) {
      return 'https://via.placeholder.com/48?text=' + encodeURIComponent(category.name.charAt(0));
    }
    
    if (iconSource.startsWith('http')) {
      return iconSource;
    }
    
    return `${IMAGE_BASE_URL}${iconSource}`;
  }, []);

  const renderCartButton = useCallback((product: Product) => {
    const productId = product.id;
    const quantity = cartQuantities[productId] || 0;
    const isLoading = addingToCart[productId] || false;
    const isOutOfStock = product.stock === 0;

    if (isOutOfStock) {
      return (
        <View style={styles.outOfStockButton}>
          <Text style={styles.outOfStockText}>Out of Stock</Text>
        </View>
      );
    }

    if (quantity > 0) {
      return (
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={[styles.quantityButton, isLoading && styles.disabledButton]}
            onPress={() => updateCartQuantity(productId, quantity - 1)}
            disabled={isLoading}
          >
            <Ionicons name="remove" size={16} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{quantity}</Text>
          <TouchableOpacity
            style={[styles.quantityButton, isLoading && styles.disabledButton]}
            onPress={() => updateCartQuantity(productId, quantity + 1)}
            disabled={isLoading || quantity >= product.stock}
          >
            <Ionicons name="add" size={16} color="#007AFF" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.addToCartButton, isLoading && styles.disabledButton]}
        onPress={() => addToCart(productId)}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="add" size={16} color="#fff" />
        )}
      </TouchableOpacity>
    );
  }, [cartQuantities, addingToCart, addToCart, updateCartQuantity]);

  const renderTopBar = useCallback(() => (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.locationContainer} onPress={() => router.push('/address')}>
        <Ionicons name="location-outline" size={20} color="#333" />
        <Text style={styles.locationText} numberOfLines={1}>{userAddress}</Text>
        <Ionicons name="chevron-down" size={16} color="#333" />
      </TouchableOpacity>
      <View style={styles.topBarActions}>
        <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
          <Ionicons name="bag-outline" size={24} color="#333" />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  ), [userAddress, cartCount, handleCartPress]);

  const renderSearchBar = useCallback(() => (
    <View style={styles.searchBarContainer}>
      <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search for products..."
        placeholderTextColor="#888"
        value={searchQuery}
        onChangeText={setSearchQuery}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  ), [searchQuery]);

  const renderCategoryFilterRow = useCallback(() => (
    <View style={styles.categoryFilterRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
        <TouchableOpacity 
          key="category-all"
          onPress={() => handleCategoryPress(null)} 
          style={{ alignItems: 'center', marginHorizontal: 8 }}
        >
          <View style={[styles.categoryIconContainer, selectedCategory === null && styles.categoryUberSelected]}>
            <Ionicons name="grid" size={24} color={selectedCategory === null ? '#fff' : '#007AFF'} />
          </View>
          <Text style={[styles.categoryUberLabel, selectedCategory === null && styles.categoryUberLabelSelected]}>All</Text>
        </TouchableOpacity>
        
        {categories.map((cat, index) => {
          const iconUrl = getCategoryIconUrl(cat);
          const categoryKey = cat.id || `category-${cat.name}-${index}`;
          const isSelected = selectedCategory === cat.id;
          
          return (
            <TouchableOpacity 
              key={categoryKey}
              onPress={() => handleCategoryPress(cat.id)} 
              style={{ alignItems: 'center', marginHorizontal: 8 }}
            >
              <View style={[styles.categoryIconContainer, isSelected && styles.categoryUberSelected]}>
                <Image
                  source={{ uri: iconUrl }}
                  style={styles.categoryIcon}
                  resizeMode="contain"
                  onError={() => {
                    console.log('Category icon failed to load for:', cat.name);
                  }}
                />
              </View>
              <Text style={[styles.categoryUberLabel, isSelected && styles.categoryUberLabelSelected]}>{cat.name}</Text>
            </TouchableOpacity>
          );
        })}
        
        <TouchableOpacity 
          key="request-product"
          onPress={() => requestFormRef.current?.openForm()}
          style={{ alignItems: 'center', marginHorizontal: 8 }}
        >
          <View style={styles.requestProductIconContainer}>
            <Ionicons name="add-circle-outline" size={24} color="#FF6B35" />
          </View>
          <Text style={styles.requestProductLabel}>Request Product</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  ), [categories, selectedCategory, getCategoryIconUrl, handleCategoryPress]);

  const renderProductTile = useCallback(({ item, index }: { item: Product; index: number }) => {
    const imageUrl = getImageUrl(item.images);
    const isOutOfStock = item.stock === 0;
    
    return (
      <View style={[styles.productTile, isOutOfStock && styles.outOfStockTile]}>
        <TouchableOpacity 
          onPress={() => handleProductPress(item)}
          disabled={isOutOfStock}
          style={isOutOfStock ? styles.disabledTouchable : undefined}
        >
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.productTileImage, isOutOfStock && styles.dimmedImage]}
              resizeMode="cover"
              onError={() => {
                console.log('Product image failed to load for:', item.name);
              }}
            />
            {isOutOfStock && (
              <View style={styles.outOfStockOverlay}>
                <Text style={styles.outOfStockOverlayText}>Out of Stock</Text>
              </View>
            )}
          </View>
          <View style={styles.productTileContent}>
            <Text style={[styles.productTileName, isOutOfStock && styles.dimmedText]} numberOfLines={2}>{item.name}</Text>
            <Text style={[styles.productTileBrand, isOutOfStock && styles.dimmedText]} numberOfLines={1}>{item.brand?.name || 'No Brand'}</Text>
            <Text style={[styles.productTilePrice, isOutOfStock && styles.dimmedPrice]}>₹{item.price}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.cartButtonContainer}>
          {renderCartButton(item)}
        </View>
      </View>
    );
  }, [getImageUrl, handleProductPress, renderCartButton]);

  const renderProductCard = useCallback(({ item, index }: { item: Product; index: number }) => {
    const imageUrl = getImageUrl(item.images);
    const isOutOfStock = item.stock === 0;
    
    return (
      <View style={[styles.productCard, isOutOfStock && styles.outOfStockTile]}>
        <TouchableOpacity 
          onPress={() => handleProductPress(item)}
          disabled={isOutOfStock}
          style={isOutOfStock ? styles.disabledTouchable : undefined}
        >
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.productCardImage, isOutOfStock && styles.dimmedImage]}
              resizeMode="cover"
              onError={() => {
                console.log('Product card image failed to load for:', item.name);
              }}
            />
            {isOutOfStock && (
              <View style={styles.outOfStockOverlay}>
                <Text style={styles.outOfStockOverlayText}>Out of Stock</Text>
              </View>
            )}
          </View>
          <View style={styles.productCardContent}>
            <Text style={[styles.productCardName, isOutOfStock && styles.dimmedText]} numberOfLines={2}>{item.name}</Text>
            <Text style={[styles.productCardBrand, isOutOfStock && styles.dimmedText]} numberOfLines={1}>{item.brand?.name || 'No Brand'}</Text>
            <Text style={[styles.productCardPrice, isOutOfStock && styles.dimmedPrice]}>₹{item.price}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.cartButtonContainer}>
          {renderCartButton(item)}
        </View>
      </View>
    );
  }, [getImageUrl, handleProductPress, renderCartButton]);

  const renderCategorySection = useCallback(({ item: category, index }: { item: Category; index: number }) => {
    console.log(`\n========================================`);
    console.log(`🔍 FILTERING CATEGORY: ${category.name}`);
    console.log(`Category ID: ${category.id}`);
    console.log(`Total products available: ${products.length}`);
    
    const categoryProducts = products.filter(product => {
      console.log(`\n  📦 Product: ${product.name}`);
      console.log(`    Product.category:`, product.category);
      console.log(`    typeof:`, typeof product.category);
      
      if (!product.category) {
        console.log(`    ❌ No category`);
        return false;
      }
      
      if (typeof product.category === 'object') {
        console.log(`    Product category.id: "${product.category.id}"`);
        console.log(`    Category id: "${category.id}"`);
        const match = product.category.id === category.id;
        console.log(`    Match: ${match}`);
        return match;
      }
      
      if (typeof product.category === 'string') {
        console.log(`    Product category (string): "${product.category}"`);
        console.log(`    Category id: "${category.id}"`);
        const match = product.category === category.id;
        console.log(`    Match: ${match}`);
        return match;
      }
      
      console.log(`    ❌ Unexpected type`);
      return false;
    });

    console.log(`\n✅ RESULT: ${categoryProducts.length} products for "${category.name}"`);
    console.log(`========================================\n`);

    if (categoryProducts.length === 0) {
      console.log(`⚠️ No products found, skipping category: ${category.name}`);
      return null;
    }
    
    return (
      <View style={styles.categorySection}>
        <View style={styles.categorySectionHeader}>
          <Text style={styles.categorySectionTitle}>{category.name}</Text>
          <TouchableOpacity onPress={() => handleViewAllPress(category.id)}>
            <Text style={styles.viewAllText}>View All ({categoryProducts.length})</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={categoryProducts}
          renderItem={renderProductCard}
          keyExtractor={(item, idx) => `cat-${category.id}-prod-${item.id}-${idx}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryProductList}
          nestedScrollEnabled={true}
          removeClippedSubviews={false}
          initialNumToRender={3}
          maxToRenderPerBatch={5}
        />
      </View>
    );
  }, [products, renderProductCard, handleViewAllPress]);

  const handleRequestSubmitted = useCallback(() => {
    Alert.alert('Thank you!', 'Your product request has been submitted.');
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <AnimatedLogo />
        </View>
      </SafeAreaView>
    );
  }

  const isGridMode = searchQuery.trim() || selectedCategory;

  return (
    <SafeAreaView style={styles.container}>
      {renderTopBar()}
      {renderSearchBar()}
      {renderCategoryFilterRow()}
      
      {isGridMode ? (
        <FlatList
          key="products-grid-view"
          data={filteredProducts}
          renderItem={renderProductTile}
          keyExtractor={(item, index) => `grid-product-${item.id || index}-${index}`}
          numColumns={2}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 32 }}>
              <Text style={{ color: '#888', fontSize: 16 }}>No products found.</Text>
            </View>
          }
          ListFooterComponent={() => (
            <View>
              <View style={styles.borderlessRequestSection}>
                <RequestProductSection 
                  ref={requestFormRef}
                  onRequestSubmitted={handleRequestSubmitted} 
                />
              </View>
              <View style={{ height: 180 }} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 180 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
            />
          }
          removeClippedSubviews={false}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={10}
        />
      ) : (
        <FlatList
          key="categories-browse-view"
          data={categories}
          renderItem={renderCategorySection}
          keyExtractor={(item, index) => `category-section-${item.id}-${index}`}
          ListFooterComponent={() => (
            <View>
              <View style={styles.borderlessRequestSection}>
                <RequestProductSection 
                  ref={requestFormRef}
                  onRequestSubmitted={handleRequestSubmitted} 
                />
              </View>
              <View style={{ height: 180 }} />
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 32 }}>
              <Text style={{ color: '#888', fontSize: 16 }}>No categories found.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={retryConnection}>
                <Text style={styles.retryButtonText}>Retry Loading</Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
            />
          }
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 180 }}
          removeClippedSubviews={false}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={8}
        />
      )}
      
      {showCartNotification && (
        <View style={styles.cartNotification}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.cartNotificationText}>Added to cart!</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 16,
    height: 48,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 6,
    marginRight: 4,
    flex: 1,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartButton: {
    marginLeft: 8,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  logoContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: 120,
    height: 120,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 25,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#222',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
  },
  categoryFilterRow: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    marginBottom: 8,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryIcon: {
    width: '80%',
    height: '80%',
    borderRadius: 20,
  },
  categoryUberSelected: {
    backgroundColor: '#007AFF',
  },
  categoryUberLabel: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
  },
  categoryUberLabelSelected: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  requestProductIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF0E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderStyle: 'dashed',
  },
  requestProductLabel: {
    fontSize: 12,
    color: '#FF6B35',
    textAlign: 'center',
    fontWeight: '600',
  },
  productTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxWidth: '48%',
    position: 'relative',
  },
  productTileImage: {
    width: '100%',
    height: 160,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  productTileContent: {
    padding: 12,
    paddingBottom: 50,
  },
  productTileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 18,
  },
  productTileBrand: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  productTilePrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  productCard: {
    width: 150,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  productCardImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  productCardContent: {
    padding: 12,
    paddingBottom: 50,
  },
  productCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 18,
  },
  productCardBrand: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  productCardPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  categorySection: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categorySectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  viewAllText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  categoryProductList: {
    paddingHorizontal: 8,
  },
  cartNotification: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cartNotificationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cartButtonContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    left: 8,
  },
  addToCartButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minHeight: 36,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    minWidth: 30,
    textAlign: 'center',
  },
  outOfStockButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  outOfStockText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  outOfStockTile: {
    opacity: 0.6,
  },
  disabledTouchable: {
    opacity: 1,
  },
  imageContainer: {
    position: 'relative',
  },
  dimmedImage: {
    opacity: 0.5,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  outOfStockOverlayText: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  dimmedText: {
    opacity: 0.6,
  },
  dimmedPrice: {
    opacity: 0.6,
    color: '#999',
  },
  borderlessRequestSection: {
    marginHorizontal: 16,
    marginTop: 20,
  },
});

export default HomeScreen;