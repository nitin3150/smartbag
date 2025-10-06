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
import { useDashboardStore } from "@/store/dashboardStore";
import { wsService } from "@/services/websocket";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Upload, X, Package, Image as ImageIcon } from "lucide-react";

interface ProductFormData {
  name: string;
  price: string;
  stock: string;
  category: string;
  brand: string;
  status: string;
  images: string[];
  keywords: string;
  description: string;
}

export default function Products() {
  const { products, brands, categories, setProducts, setCategories, setBrands } = useDashboardStore();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasNewImages, setHasNewImages] = useState(false);
  
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    price: "",
    stock: "",
    category: "",
    brand: "",
    status: "active",
    images: [],
    keywords: "",
    description: "",
  });

  // Debug: Log products data when it changes
  // useEffect(() => {
  //   console.log('=== PRODUCTS DATA DEBUG ===');
  //   console.log('Total products:', products.length);
  //   if (products.length > 0) {
  //     console.log('First product structure:', products[0]);
  //     console.log('First product images:', products[0].images);
  //     console.log('First product image type:', typeof products[0].images);
  //     console.log('First product image array?', Array.isArray(products[0].images));
  //   }
  //   console.log('=== END PRODUCTS DEBUG ===');
  // }, [products]);

  // Request initial data and set up real-time handlers
  useEffect(() => {
    console.log('Products component mounted, requesting data...');
    
    wsService.send({
      type: 'get_products'
    });

    const handleProductsData = (data) => {
      // console.log('Received products data:', data);
      // console.log('Products count:', data.products?.length || 0);
      
      // Debug first product images
      // if (data.products && data.products.length > 0) {
      //   // console.log('First product from server:', data.products[0]);
      //   console.log('First product images from server:', data.categories[0].id);
      // }
      
      setProducts(data.products || []);
      setCategories(data.categories || []);
      setBrands(data.brands || []);
      setIsLoading(false);
    };

    const handleProductCreated = (data) => {
      console.log('Product created:', data);
      wsService.send({ type: 'get_products' });
      setIsLoading(false);
    };

    const handleProductUpdated = (data) => {
      console.log('Product updated:', data);
      wsService.send({ type: 'get_products' });
      setIsLoading(false);
    };

    const handleProductDeleted = (data) => {
      console.log('Product deleted:', data);
      wsService.send({ type: 'get_products' });
      setIsLoading(false);
    };

    const handleUploadProgress = (data) => {
      console.log('Upload progress:', data);
      if (data.progress === 100) {
        setIsUploading(false);
      }
    };

    const handleError = (data) => {
      console.error('WebSocket error:', data);
      setIsLoading(false);
      setIsUploading(false);
      toast({
        title: "Error",
        description: data.message || "An error occurred",
        variant: "destructive",
      });
    };

    // Register message handlers
    wsService.onMessage("products_data", handleProductsData);
    wsService.onMessage("product_created", handleProductCreated);
    wsService.onMessage("product_updated", handleProductUpdated);
    wsService.onMessage("product_deleted", handleProductDeleted);
    wsService.onMessage("upload_progress", handleUploadProgress);
    wsService.onMessage("error", handleError);

    return () => {
      wsService.onMessage("products_data", () => {});
      wsService.onMessage("product_created", () => {});
      wsService.onMessage("product_updated", () => {});
      wsService.onMessage("product_deleted", () => {});
      wsService.onMessage("upload_progress", () => {});
      wsService.onMessage("error", () => {});
    };
  }, [setProducts, setCategories, setBrands, toast]);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.category && product.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // console.log('Submitting product form:', formData);
    // console.log('Has new images:', hasNewImages);
    // console.log('Number of images:', formData.images.length);
    
    try {
      const productData = {
        name: formData.name,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock),
        category: formData.category,
        brand: formData.brand,
        status: formData.status,
        description: formData.description,
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
      };

      // Include images array if user uploaded new images
      if (hasNewImages && formData.images.length > 0) {
        productData.images = formData.images;
        console.log('Including new images data in submission:', formData.images.length, 'images');
      }

      setIsLoading(true);

      if (editingProduct) {
        wsService.send({
          type: 'update_product',
          data: { id: editingProduct.id, ...productData }
        });
        toast({
          title: "Updating Product",
          description: hasNewImages ? `Uploading ${formData.images.length} images and updating product...` : "Updating product...",
        });
      } else {
        wsService.send({
          type: 'create_product',
          data: productData
        });
        toast({
          title: "Creating Product",
          description: hasNewImages ? `Uploading ${formData.images.length} images and creating product...` : "Creating product...",
        });
      }

      // Reset form
      resetForm();
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to process request",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (product: any) => {
    console.log('=== EDITING PRODUCT ===');
    console.log('Product category from DB:', product.category);
    console.log('Product brand from DB:', product.brand);
    
    // Find the category/brand objects to get their custom IDs
    const categoryObj = categories.find(c => c._id === product.category);
    const brandObj = brands.find(b => b._id === product.brand);
    
    console.log('Found category object:', categoryObj);
    console.log('Found brand object:', brandObj);
    console.log('Will use category ID:', categoryObj?.id);
    console.log('Will use brand ID:', brandObj?.id);
    
    try {
      setEditingProduct(product);
      setFormData({
        name: product.name || "",
        price: product.price?.toString() || "",
        stock: product.stock?.toString() || "",
        category: product.category || "",
        brand: product.brand || "",
        status: product.status || "active",
        images: [], // Don't include existing images in form data
        keywords: product.keywords?.join(', ') || "",
        description: product.description || "",
      });
      
      // Show existing images as previews
      const existingImages = getImageUrls(product.images);
      // console.log('Existing image URLs:', existingImages);
      setImagePreviews(existingImages);
      setHasNewImages(false);
      setShowAddModal(true);
    } catch (error) {
      console.error('Error in handleEdit:', error);
      toast({
        title: "Error",
        description: "Failed to load product data for editing",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (productId: string) => {
    if (confirm("Are you sure you want to delete this product? This will also delete all images.")) {
      setIsLoading(true);
      wsService.send({
        type: 'delete_product',
        data: { id: productId }
      });
      toast({
        title: "Deleting Product",
        description: "Please wait...",
      });
    }
  };

  const handleImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    console.log('Product images selected:', files.length, 'files');
    
    // Validate files
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: `${file.name} is not an image file`,
          variant: "destructive",
        });
        return false;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: `${file.name} is larger than 5MB`,
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    });

    if (validFiles.length === 0) return;

    if (validFiles.length > 10) {
      toast({
        title: "Too Many Images",
        description: "Please select maximum 10 images",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const imagePromises = validFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises)
      .then(results => {
        console.log('All images converted to base64:', results.length, 'images');
        
        setFormData({ ...formData, images: results });
        setImagePreviews(results);
        setHasNewImages(true);
        setIsUploading(false);
        
        toast({
          title: "Images Ready",
          description: `${results.length} images loaded and ready to upload`,
        });
      })
      .catch(error => {
        console.error('Error converting images:', error);
        setIsUploading(false);
        toast({
          title: "Upload Error",
          description: "Failed to process some image files",
          variant: "destructive",
        });
      });
  };

  const removeImage = (index: number) => {
    console.log('Removing image at index:', index);
    
    const newImages = formData.images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    
    setFormData({ ...formData, images: newImages });
    setImagePreviews(newPreviews);
    
    if (newImages.length === 0) {
      setHasNewImages(false);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }
  };

  // ✅ Helper function to extract image URLs from different formats
  const getImageUrls = (images: any): string[] => {
    console.log('getImageUrls called with:', images);
    
    if (!images) {
      console.log('No images provided');
      return [];
    }
    
    // Handle array of image objects
    if (Array.isArray(images)) {
      console.log('Images is an array with length:', images.length);
      return images.map(img => {
        console.log('Processing image object:', img);
        
        if (typeof img === 'string') {
          console.log('Image is string URL:', img);
          return img;
        } else if (typeof img === 'object' && img !== null) {
          // Try different URL properties
          const url = img.url || img.secure_url || img.original || img.thumbnail;
          console.log('Extracted URL from object:', url);
          return url;
        }
        return '';
      }).filter(Boolean);
    }
    
    // Handle single image (backward compatibility)
    if (typeof images === 'string') {
      console.log('Images is single string:', images);
      return [images];
    }
    
    console.log('Unknown images format:', typeof images);
    return [];
  };

  // ✅ Helper function to get primary image URL
  const getPrimaryImageUrl = (images: any): string => {
    const imageUrls = getImageUrls(images);
    const primaryUrl = imageUrls[0] || '';
    console.log('Primary image URL:', primaryUrl);
    return primaryUrl;
  };

  const resetForm = () => {
    setEditingProduct(null);
    setImagePreviews([]);
    setHasNewImages(false);
    setFormData({
      name: "",
      price: "",
      stock: "",
      category: "",
      brand: "",
      status: "active",
      images: [],
      keywords: "",
      description: "",
    });
    setShowAddModal(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
              <DialogDescription>
                {editingProduct ? "Update product information" : "Fill in the details to create a new product"}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock">Stock Quantity</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category || ""}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Select
                    value={formData.brand || ""}
                    onValueChange={(value) => setFormData({ ...formData, brand: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Multiple Images Upload Section */}
              <div className="space-y-2">
                <Label>Product Images</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImagesUpload}
                      disabled={isUploading}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFormData({ ...formData, images: [] });
                        setImagePreviews([]);
                        setHasNewImages(false);
                        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
                        if (input) input.value = '';
                      }}
                      disabled={isUploading || imagePreviews.length === 0}
                    >
                      Clear All
                    </Button>
                  </div>
                  
                  {isUploading && (
                    <div className="flex items-center space-x-2 p-2 bg-muted rounded">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="text-sm text-muted-foreground">Processing images...</span>
                    </div>
                  )}
                  
                  {imagePreviews.length > 0 && !isUploading && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {hasNewImages ? `${imagePreviews.length} new images ready to upload` : `${imagePreviews.length} existing images`}
                        </p>
                        {hasNewImages && (
                          <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            New Images
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-4 gap-3 p-3 border rounded-lg">
                        {imagePreviews.map((imageUrl, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={imageUrl}
                              alt={`Product image ${index + 1}`}
                              className="h-20 w-20 object-cover rounded border"
                              onError={(e) => {
                                console.error(`Failed to load image ${index}:`, imageUrl);
                                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZjNmNGY2Ii8+CjxwYXRoIGQ9Im0xNSAxMi0zLTMtMy4wMDEgMy0yLTItNC45OTkgNSA5Ljk5OSAwWiIgZmlsbD0iIzk0YTNiOCIvPgo8L3N2Zz4K';
                              }}
                            />
                            {hasNewImages && (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeImage(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 rounded-b">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    Upload product images (max 10 images, 5MB each, PNG/JPG/WebP recommended). First image will be the primary image.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">SEO Keywords (comma-separated)</Label>
                <Textarea
                  id="keywords"
                  placeholder="smartphone, electronics, mobile phone..."
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter product description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || isUploading}>
                  {isLoading ? "Processing..." : 
                   isUploading ? "Uploading..." : 
                   (editingProduct ? "Update Product" : "Create Product")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Catalog</CardTitle>
          <CardDescription>
            {filteredProducts.length} products found
          </CardDescription>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Images</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const primaryImageUrl = getPrimaryImageUrl(product.images);
                const imageUrls = getImageUrls(product.images);
                
                // Debug each product's images
                console.log(`Product ${product.name} images:`, {
                  raw: product.images,
                  processed: imageUrls,
                  primary: primaryImageUrl
                });
                
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {/* Primary image */}
                        {primaryImageUrl ? (
                          <img
                            src={primaryImageUrl}
                            alt={product.name}
                            className="h-12 w-12 rounded-lg object-cover border"
                            onError={(e) => {
                              console.error('Failed to load primary image:', primaryImageUrl);
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        
                        {/* Fallback icon */}
                        <div 
                          className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center border"
                          style={{ display: primaryImageUrl ? 'none' : 'flex' }}
                        >
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                        
                        {/* Additional images count */}
                        {imageUrls.length > 1 && (
                          <div className="h-12 w-8 rounded-lg bg-muted flex items-center justify-center text-xs font-medium border">
                            +{imageUrls.length - 1}
                          </div>
                        )}
                      </div>
                      
                      {/* Debug info - remove in production */}
                      <div className="text-xs text-gray-400 mt-1">
                        {imageUrls.length} img(s)
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>₹{product.price}</TableCell>
                    <TableCell>{product.stock}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={product.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {product.keywords?.slice(0, 2).map((keyword, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {(product.keywords?.length || 0) > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(product.keywords?.length || 0) - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(product)}
                          disabled={isLoading}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(product.id)}
                          disabled={isLoading}
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
          
          {filteredProducts.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No products found matching your search.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}