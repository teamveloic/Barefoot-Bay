import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Product } from "@shared/schema";
import { ChevronLeft, ShoppingCart } from "lucide-react";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Selected variant options
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  
  // Fetch product details
  const { data: product, isLoading } = useQuery<Product>({
    queryKey: [`/api/products/${id}`],
    enabled: !!id,
  });

  // Initialize the cart from localStorage
  const [cart, setCart] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const savedCart = localStorage.getItem('barefootbay-cart');
      return savedCart ? JSON.parse(savedCart) : [];
    }
    return [];
  });

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('barefootbay-cart', JSON.stringify(cart));
    }
  }, [cart]);

  // Extract available variants from product with availability info
  const getVariantOptions = () => {
    if (!product?.variantData || !product?.variantData?.variants) {
      return { options: {}, availabilityMap: {} };
    }

    const variants = product.variantData.variants || [];
    const options: Record<string, Set<string>> = {};
    const availabilityMap: Record<string, Record<string, boolean>> = {};
    
    // Extract all possible option types and values
    for (const v of variants) {
      if (v.options) {
        for (const opt of v.options) {
          // Add to options set
          if (!options[opt.type]) {
            options[opt.type] = new Set();
          }
          options[opt.type].add(opt.value);
          
          // Track availability status
          if (!availabilityMap[opt.type]) {
            availabilityMap[opt.type] = {};
          }
          
          // A variant is available if it's in stock or sync_variant_id is present
          const isAvailable = v.in_stock || v.sync_variant_id || false;
          availabilityMap[opt.type][opt.value] = isAvailable;
        }
      }
    }
    
    // Convert Sets to Arrays for easier rendering
    const result: Record<string, string[]> = {};
    Object.keys(options).forEach(key => {
      result[key] = Array.from(options[key]);
    });
    
    return { 
      options: result, 
      availabilityMap 
    };
  };
  
  // Check if a specific variant option is available
  const isOptionAvailable = (type: string, value: string) => {
    if (!variantData || !variantData.availabilityMap || !variantData.availabilityMap[type]) return true;
    return variantData.availabilityMap[type][value] !== false;
  };

  // Handle variant selection
  const handleVariantChange = (type: string, value: string) => {
    setSelectedVariants(prev => ({
      ...prev,
      [type]: value
    }));
  };

  // Format selected variants into a string
  const formatSelectedVariants = () => {
    return Object.entries(selectedVariants)
      .map(([type, value]) => `${type}: ${value}`)
      .join(', ');
  };

  // Add to cart with selected variants
  const addToCart = () => {
    if (!product) return;
    
    // Create variant string from selections
    const variantString = formatSelectedVariants();
    
    setCart(prevCart => {
      // Check if product with same variant is already in cart
      const existingItemIndex = prevCart.findIndex(
        item => item.product.id === product.id && item.variant === variantString
      );
      
      if (existingItemIndex >= 0) {
        // Update quantity if item exists
        const newCart = [...prevCart];
        newCart[existingItemIndex].quantity += 1;
        
        toast({
          title: "Quantity updated",
          description: `Increased quantity of ${product.name} in your cart.`,
        });
        
        return newCart;
      } else {
        // Add new item to cart
        toast({
          title: "Added to cart",
          description: `${product.name} has been added to your cart.`,
        });
        
        return [...prevCart, {
          product,
          quantity: 1,
          variant: variantString,
        }];
      }
    });
  };

  // Format price
  const formatPrice = (price: number | string) => {
    return `$${Number(price).toFixed(2)}`;
  };

  // Show loading state
  if (isLoading || !product) {
    return (
      <div className="container max-w-7xl mx-auto p-8">
        <div className="flex items-center mb-8">
          <Button
            variant="ghost"
            className="mr-2"
            onClick={() => setLocation('/store')}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Store
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="h-96 bg-muted rounded-lg animate-pulse"></div>
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded w-3/4 animate-pulse"></div>
            <div className="h-6 bg-muted rounded w-1/4 animate-pulse"></div>
            <div className="h-32 bg-muted rounded w-full animate-pulse"></div>
            <div className="h-10 bg-muted rounded w-full animate-pulse"></div>
            <div className="h-12 bg-muted rounded w-full animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  const variantData = getVariantOptions();
  const hasVariants = Object.keys(variantData.options).length > 0;

  return (
    <div className="container max-w-7xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <Button
          variant="ghost"
          className="mr-2"
          onClick={() => setLocation('/store')}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Store
        </Button>
        
        <Button variant="outline" className="relative" onClick={() => setLocation('/store')}>
          <ShoppingCart className="h-5 w-5 mr-2" />
          <span>Cart</span>
          {cart.length > 0 && (
            <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {cart.length}
            </div>
          )}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Product Images */}
        <div>
          {product.imageUrls && product.imageUrls.length > 0 ? (
            <Carousel className="w-full">
              <CarouselContent>
                {product.imageUrls.map((url, index) => (
                  <CarouselItem key={index}>
                    <div className="p-1">
                      <div className="overflow-hidden rounded-lg bg-muted aspect-square">
                        <img 
                          src={url} 
                          alt={`${product.name} - Image ${index + 1}`} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </Carousel>
          ) : (
            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground">No images available</span>
            </div>
          )}

          {/* Mockup images if available */}
          {product.mockupUrls && product.mockupUrls.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Product Mockups</h3>
              <div className="grid grid-cols-3 gap-2">
                {product.mockupUrls.map((url, index) => (
                  <div key={index} className="overflow-hidden rounded-md bg-muted aspect-square">
                    <img 
                      src={url} 
                      alt={`${product.name} mockup ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Product Info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="text-2xl font-medium mt-2 text-coral">{formatPrice(product.price)}</p>
          </div>
          
          <div>
            <p className="text-muted-foreground">{product.description}</p>
          </div>
          
          {/* Variant Selection */}
          {hasVariants && (
            <div className="space-y-4">
              <Separator />
              <div className="grid gap-4">
                <h3 className="font-medium">Options</h3>
                
                {Object.entries(variantData.options).map(([type, values]) => (
                  <div key={type} className="grid grid-cols-2 gap-2 items-center">
                    <label htmlFor={type} className="text-sm font-medium">
                      {type.charAt(0).toUpperCase() + type.slice(1)}:
                    </label>
                    <Select 
                      value={selectedVariants[type] || ''}
                      onValueChange={(value) => handleVariantChange(type, value)}
                    >
                      <SelectTrigger id={type}>
                        <SelectValue placeholder={`Select ${type}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {values.map((value) => {
                          const isAvailable = isOptionAvailable(type, value);
                          return (
                            <SelectItem 
                              key={value} 
                              value={value}
                              disabled={!isAvailable}
                              className={!isAvailable ? "opacity-50 cursor-not-allowed" : ""}
                            >
                              {value} {!isAvailable && " (Out of stock)"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <Separator />
            </div>
          )}
          
          {/* Add to Cart Button */}
          <Button 
            onClick={addToCart} 
            className="w-full bg-coral hover:bg-coral/90 text-white"
            size="lg"
          >
            <ShoppingCart className="mr-2 h-5 w-5" />
            Add to Cart
          </Button>
          
          {/* Additional Information */}
          <Tabs defaultValue="details" className="w-full mt-8">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="shipping">Shipping</TabsTrigger>
              <TabsTrigger value="returns">Returns</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="p-4">
              <div className="text-sm text-muted-foreground">
                <ul className="list-disc pl-5 space-y-1">
                  {product.printProvider && (
                    <li>Provider: {product.printProvider}</li>
                  )}
                  <li>Category: {product.category}</li>
                  {product.variantData && product.variantData.shipping_info && product.variantData.shipping_info.origin_country && (
                    <li>Made in {product.variantData.shipping_info.origin_country}</li>
                  )}
                </ul>
              </div>
            </TabsContent>
            <TabsContent value="shipping" className="p-4">
              <div className="text-sm text-muted-foreground">
                <p>Free shipping on orders over $50.</p>
                <p>Standard shipping takes 5-7 business days.</p>
                <p>Express shipping available at checkout (2-3 business days).</p>
              </div>
            </TabsContent>
            <TabsContent value="returns" className="p-4">
              <div className="text-sm text-muted-foreground">
                <p>We accept returns within 30 days of delivery.</p>
                <p>Items must be unused and in original packaging.</p>
                <p>Contact store@barefootbay.org to initiate a return.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      

    </div>
  );
}