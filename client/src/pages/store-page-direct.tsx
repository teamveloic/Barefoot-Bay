import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProductCategory } from "@shared/schema";
import { Product } from "@shared/schema";
import { ShoppingCart, Trash, Plus, Minus } from "lucide-react";
import { CheckoutDialog } from "@/components/store/checkout-dialog";

type CartItem = {
  product: Product;
  quantity: number;
  variant?: string;
};

/**
 * Direct replacement for the store page that completely removes the Featured Products section
 * This implementation avoids rendering the featured products carousel entirely
 */
export default function StorePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string>(ProductCategory.ALL);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  
  // Initialize cart from localStorage if available
  const [cart, setCart] = useState<CartItem[]>(() => {
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
  
  // Sponsorship tab products - no longer using highlighted/featured query
  const [highlightedProducts, setHighlightedProducts] = useState<Product[]>([]);
  const [highlightedLoading, setHighlightedLoading] = useState(false);
  
  // Fetch products by current category
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: [`/api/products/category/${activeCategory}`],
  });
  
  // Calculate cart total
  const cartTotal = cart.reduce((total, item) => {
    return total + (Number(item.product.price) * item.quantity);
  }, 0);
  
  // Add item to cart
  const addToCart = (product: Product, variant?: string) => {
    setCart(prevCart => {
      // Check if product is already in cart
      const existingItem = prevCart.find(
        item => item.product.id === product.id && item.variant === variant
      );
      
      if (existingItem) {
        // Update quantity if item exists
        toast({
          title: "Quantity updated",
          description: `Increased quantity of ${product.name} in your cart.`,
        });
        return prevCart.map(item => 
          item.product.id === product.id && item.variant === variant
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        // Add new item to cart
        toast({
          title: "Item added to cart",
          description: `${product.name} has been added to your cart.`,
        });
        return [...prevCart, { product, quantity: 1, variant }];
      }
    });
  };
  
  // Update cart item quantity
  const updateQuantity = (index: number, amount: number) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      newCart[index].quantity += amount;
      
      // Remove item if quantity is 0
      if (newCart[index].quantity <= 0) {
        newCart.splice(index, 1);
      }
      
      return newCart;
    });
  };
  
  // Remove item from cart
  const removeFromCart = (index: number) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      const removedItem = newCart[index];
      newCart.splice(index, 1);
      
      toast({
        title: "Item removed",
        description: `${removedItem.product.name} has been removed from your cart.`,
      });
      
      return newCart;
    });
  };
  
  // Clear cart
  const clearCart = () => {
    if (cart.length > 0) {
      toast({
        title: "Cart cleared",
        description: "All items have been removed from your cart.",
      });
      setCart([]);
    }
  };
  
  // Format price
  const formatPrice = (price: number | string) => {
    return `$${Number(price).toFixed(2)}`;
  };
  
  return (
    <div className="container max-w-7xl mx-auto p-8">
      {/* Store Header */}
      <div className="hidden md:flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Barefoot Bay Community Store</h1>
        
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative">
              <ShoppingCart className="h-5 w-5 mr-2" />
              <span>Cart</span>
              {cart.length > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -right-2">
                  {cart.length}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Shopping Cart</SheetTitle>
              <SheetDescription>
                Review your items before checkout
              </SheetDescription>
            </SheetHeader>
            
            <div className="mt-6 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Your cart is empty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item, index) => (
                    <div key={`${item.product.id}-${item.variant || 'default'}`} className="flex justify-between items-center p-4 bg-muted/40 rounded-lg">
                      <div>
                        <h3 className="font-medium">{item.product.name}</h3>
                        {item.variant && (
                          <p className="text-sm text-muted-foreground">Variant: {item.variant}</p>
                        )}
                        <div className="flex items-center mt-2 space-x-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => updateQuantity(index, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => updateQuantity(index, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span>{formatPrice(Number(item.product.price) * item.quantity)}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive mt-2"
                          onClick={() => removeFromCart(index)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-4">
              <Separator />
              <div className="flex justify-between py-4">
                <span className="font-medium">Total</span>
                <span className="font-bold">{formatPrice(cartTotal)}</span>
              </div>
              <Separator />
            </div>
            
            <SheetFooter className="mt-6">
              <div className="grid w-full gap-2">
                <Button 
                  className="w-full bg-coral hover:bg-coral/90" 
                  disabled={cart.length === 0}
                  onClick={() => {
                    if (cart.length > 0) {
                      setIsCheckoutOpen(true);
                    }
                  }}
                >
                  Proceed to Checkout
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={clearCart}
                  disabled={cart.length === 0}
                >
                  Clear Cart
                </Button>
                <SheetClose asChild>
                  <Button variant="ghost">Continue Shopping</Button>
                </SheetClose>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
      
      {/* Mobile floating cart button */}
      <div className="md:hidden fixed bottom-6 right-6 z-10 fab-container">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" className="h-14 w-14 rounded-full shadow-lg bg-coral hover:bg-coral/90 text-white relative single-fab">
              <ShoppingCart className="h-6 w-6" />
              {cart.length > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -right-2">
                  {cart.length}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Shopping Cart</SheetTitle>
              <SheetDescription>
                Review your items before checkout
              </SheetDescription>
            </SheetHeader>
            
            <div className="mt-6 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Your cart is empty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item, index) => (
                    <div key={`${item.product.id}-${item.variant || 'default'}`} className="flex justify-between items-center p-4 bg-muted/40 rounded-lg">
                      <div>
                        <h3 className="font-medium">{item.product.name}</h3>
                        {item.variant && (
                          <p className="text-sm text-muted-foreground">Variant: {item.variant}</p>
                        )}
                        <div className="flex items-center mt-2 space-x-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => updateQuantity(index, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => updateQuantity(index, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span>{formatPrice(Number(item.product.price) * item.quantity)}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive mt-2"
                          onClick={() => removeFromCart(index)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-4">
              <Separator />
              <div className="flex justify-between py-4">
                <span className="font-medium">Total</span>
                <span className="font-bold">{formatPrice(cartTotal)}</span>
              </div>
              <Separator />
            </div>
            
            <SheetFooter className="mt-6">
              <div className="grid w-full gap-2">
                <Button 
                  className="w-full bg-coral hover:bg-coral/90" 
                  disabled={cart.length === 0}
                  onClick={() => {
                    if (cart.length > 0) {
                      setIsCheckoutOpen(true);
                    }
                  }}
                >
                  Proceed to Checkout
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={clearCart}
                  disabled={cart.length === 0}
                >
                  Clear Cart
                </Button>
                <SheetClose asChild>
                  <Button variant="ghost">Continue Shopping</Button>
                </SheetClose>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
      
      {/* Categories - NO FEATURED PRODUCTS SECTION HERE */}
      <Tabs 
        value={activeCategory} 
        onValueChange={setActiveCategory}
        className="mb-8"
      >
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value={ProductCategory.ALL}>All</TabsTrigger>
          <TabsTrigger value={ProductCategory.SPONSORSHIP}>Sponsorship</TabsTrigger>
          <TabsTrigger value={ProductCategory.APPAREL}>Apparel</TabsTrigger>
          <TabsTrigger value={ProductCategory.HOME}>Home</TabsTrigger>
          <TabsTrigger value={ProductCategory.ACCESSORIES}>Accessories</TabsTrigger>
        </TabsList>
        
        {/* Sponsorship Tab */}
        <TabsContent value={ProductCategory.SPONSORSHIP} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {highlightedLoading ? (
              Array(3).fill(0).map((_, index) => (
                <Card key={index} className="h-80 animate-pulse">
                  <div className="h-40 bg-muted rounded-t-lg"></div>
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <div className="h-4 bg-muted rounded w-1/4"></div>
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                  </CardFooter>
                </Card>
              ))
            ) : highlightedProducts.length === 0 ? (
              <div className="col-span-3 text-center py-12">
                <p className="text-muted-foreground">No sponsorship products available</p>
              </div>
            ) : (
              highlightedProducts.map((product) => (
                <Card key={product.id} className="overflow-hidden group cursor-pointer">
                  <div onClick={() => setLocation(`/product/${product.id}`)} className="aspect-square overflow-hidden bg-muted">
                    {product.imageUrls && product.imageUrls.length > 0 ? (
                      <img 
                        src={product.imageUrls[0]} 
                        alt={product.name} 
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ShoppingCart className="h-10 w-10 text-muted-foreground opacity-30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-6">
                    <h3 className="font-medium text-lg leading-tight mb-2" onClick={() => setLocation(`/product/${product.id}`)}>
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description?.substring(0, 100)}
                      {product.description && product.description.length > 100 ? '...' : ''}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <span className="font-bold">{formatPrice(product.price)}</span>
                    <Button
                      size="sm"
                      className="bg-coral hover:bg-coral/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product);
                      }}
                    >
                      Add to Cart
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        
        {/* All Products Tab */}
        <TabsContent value={ProductCategory.ALL} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, index) => (
                <Card key={index} className="h-80 animate-pulse">
                  <div className="h-40 bg-muted rounded-t-lg"></div>
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <div className="h-4 bg-muted rounded w-1/4"></div>
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                  </CardFooter>
                </Card>
              ))
            ) : products.length === 0 ? (
              <div className="col-span-3 text-center py-12">
                <p className="text-muted-foreground">No products available in this category</p>
              </div>
            ) : (
              products.map((product) => (
                <Card key={product.id} className="overflow-hidden group cursor-pointer">
                  <div onClick={() => setLocation(`/product/${product.id}`)} className="aspect-square overflow-hidden bg-muted">
                    {product.imageUrls && product.imageUrls.length > 0 ? (
                      <img 
                        src={product.imageUrls[0]} 
                        alt={product.name} 
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ShoppingCart className="h-10 w-10 text-muted-foreground opacity-30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-6">
                    <h3 className="font-medium text-lg leading-tight mb-2" onClick={() => setLocation(`/product/${product.id}`)}>
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description?.substring(0, 100)}
                      {product.description && product.description.length > 100 ? '...' : ''}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <span className="font-bold">{formatPrice(product.price)}</span>
                    <Button
                      size="sm"
                      className="bg-coral hover:bg-coral/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product);
                      }}
                    >
                      Add to Cart
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        
        {/* Apparel Tab */}
        <TabsContent value={ProductCategory.APPAREL} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, index) => (
                <Card key={index} className="h-80 animate-pulse">
                  <div className="h-40 bg-muted rounded-t-lg"></div>
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <div className="h-4 bg-muted rounded w-1/4"></div>
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                  </CardFooter>
                </Card>
              ))
            ) : products.filter(p => p.category === ProductCategory.APPAREL).length === 0 ? (
              <div className="col-span-3 text-center py-12">
                <p className="text-muted-foreground">No apparel products available</p>
              </div>
            ) : (
              products
                .filter(p => p.category === ProductCategory.APPAREL)
                .map((product) => (
                  <Card key={product.id} className="overflow-hidden group cursor-pointer">
                    <div onClick={() => setLocation(`/product/${product.id}`)} className="aspect-square overflow-hidden bg-muted">
                      {product.imageUrls && product.imageUrls.length > 0 ? (
                        <img 
                          src={product.imageUrls[0]} 
                          alt={product.name} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ShoppingCart className="h-10 w-10 text-muted-foreground opacity-30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-6">
                      <h3 className="font-medium text-lg leading-tight mb-2" onClick={() => setLocation(`/product/${product.id}`)}>
                        {product.name}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.description?.substring(0, 100)}
                        {product.description && product.description.length > 100 ? '...' : ''}
                      </p>
                    </CardContent>
                    <CardFooter className="flex justify-between p-6 pt-0">
                      <span className="font-bold">{formatPrice(product.price)}</span>
                      <Button
                        size="sm"
                        className="bg-coral hover:bg-coral/90"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                      >
                        Add to Cart
                      </Button>
                    </CardFooter>
                  </Card>
                ))
            )}
          </div>
        </TabsContent>
        
        {/* Home Tab */}
        <TabsContent value={ProductCategory.HOME} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, index) => (
                <Card key={index} className="h-80 animate-pulse">
                  <div className="h-40 bg-muted rounded-t-lg"></div>
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <div className="h-4 bg-muted rounded w-1/4"></div>
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                  </CardFooter>
                </Card>
              ))
            ) : products.filter(p => p.category === ProductCategory.HOME).length === 0 ? (
              <div className="col-span-3 text-center py-12">
                <p className="text-muted-foreground">No home products available</p>
              </div>
            ) : (
              products
                .filter(p => p.category === ProductCategory.HOME)
                .map((product) => (
                  <Card key={product.id} className="overflow-hidden group cursor-pointer">
                    <div onClick={() => setLocation(`/product/${product.id}`)} className="aspect-square overflow-hidden bg-muted">
                      {product.imageUrls && product.imageUrls.length > 0 ? (
                        <img 
                          src={product.imageUrls[0]} 
                          alt={product.name} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ShoppingCart className="h-10 w-10 text-muted-foreground opacity-30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-6">
                      <h3 className="font-medium text-lg leading-tight mb-2" onClick={() => setLocation(`/product/${product.id}`)}>
                        {product.name}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.description?.substring(0, 100)}
                        {product.description && product.description.length > 100 ? '...' : ''}
                      </p>
                    </CardContent>
                    <CardFooter className="flex justify-between p-6 pt-0">
                      <span className="font-bold">{formatPrice(product.price)}</span>
                      <Button
                        size="sm"
                        className="bg-coral hover:bg-coral/90"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                      >
                        Add to Cart
                      </Button>
                    </CardFooter>
                  </Card>
                ))
            )}
          </div>
        </TabsContent>
        
        {/* Accessories Tab */}
        <TabsContent value={ProductCategory.ACCESSORIES} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, index) => (
                <Card key={index} className="h-80 animate-pulse">
                  <div className="h-40 bg-muted rounded-t-lg"></div>
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                  <CardFooter className="flex justify-between p-6 pt-0">
                    <div className="h-4 bg-muted rounded w-1/4"></div>
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                  </CardFooter>
                </Card>
              ))
            ) : products.filter(p => p.category === ProductCategory.ACCESSORIES).length === 0 ? (
              <div className="col-span-3 text-center py-12">
                <p className="text-muted-foreground">No accessories available</p>
              </div>
            ) : (
              products
                .filter(p => p.category === ProductCategory.ACCESSORIES)
                .map((product) => (
                  <Card key={product.id} className="overflow-hidden group cursor-pointer">
                    <div onClick={() => setLocation(`/product/${product.id}`)} className="aspect-square overflow-hidden bg-muted">
                      {product.imageUrls && product.imageUrls.length > 0 ? (
                        <img 
                          src={product.imageUrls[0]} 
                          alt={product.name} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ShoppingCart className="h-10 w-10 text-muted-foreground opacity-30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-6">
                      <h3 className="font-medium text-lg leading-tight mb-2" onClick={() => setLocation(`/product/${product.id}`)}>
                        {product.name}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.description?.substring(0, 100)}
                        {product.description && product.description.length > 100 ? '...' : ''}
                      </p>
                    </CardContent>
                    <CardFooter className="flex justify-between p-6 pt-0">
                      <span className="font-bold">{formatPrice(product.price)}</span>
                      <Button
                        size="sm"
                        className="bg-coral hover:bg-coral/90"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                      >
                        Add to Cart
                      </Button>
                    </CardFooter>
                  </Card>
                ))
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Checkout Dialog */}
      <CheckoutDialog 
        open={isCheckoutOpen} 
        onOpenChange={setIsCheckoutOpen}
        cart={cart}
        cartTotal={cartTotal}
        formatPrice={formatPrice}
        onSuccess={() => {
          setCart([]);
          localStorage.removeItem('barefootbay-cart');
        }}
      />
    </div>
  );
}