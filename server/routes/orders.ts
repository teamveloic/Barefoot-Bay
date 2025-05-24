import express from 'express';
import { storage } from '../storage';
import { z } from 'zod';
import { createOrderPaymentLink, verifyOrderPayment, validateStoreDiscountCode } from '../square-service';
import { requireAdmin } from '../auth';
import { sendOrderStatusUpdateEmail } from '../email-service';

const router = express.Router();

// Schema for shipping address
const ShippingAddressSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  streetAddress: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(5, "Zip code is required"),
  country: z.string().min(1, "Country is required"),
  phone: z.string().optional(),
});

// Schema for checkout items
const CheckoutItemSchema = z.object({
  productId: z.number(),
  name: z.string(),
  quantity: z.number().min(1),
  price: z.number().min(0),
  variantInfo: z.record(z.any()).optional(),
});

// Schema for checkout request
const CheckoutRequestSchema = z.object({
  items: z.array(CheckoutItemSchema),
  shippingAddress: ShippingAddressSchema,
  discountCode: z.string().optional(),
});

// Schema for public order tracking
const TrackOrderSchema = z.object({
  orderId: z.number({ 
    required_error: "Order ID is required",
    invalid_type_error: "Order ID must be a number" 
  }),
  email: z.string().email({ message: "Valid email is required" }),
});

/**
 * Create a new order and Square payment link
 */
router.post('/checkout', async (req, res) => {
  try {
    // Require authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Validate request body
    const result = CheckoutRequestSchema.safeParse(req.body);
    if (!result.success) {
      console.error('Checkout validation failed:', result.error);
      return res.status(400).json({ 
        error: 'Invalid checkout data',
        details: result.error.issues,
      });
    }
    
    const { items, shippingAddress, discountCode } = result.data;
    
    // Calculate order total
    let total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let appliedDiscountPercentage = 0;
    
    // Apply discount code if provided
    if (discountCode) {
      console.log(`Checking discount code: ${discountCode}`);
      appliedDiscountPercentage = await validateStoreDiscountCode(discountCode);
      
      if (appliedDiscountPercentage > 0) {
        const discountAmount = (total * appliedDiscountPercentage) / 100;
        total = Math.max(0, total - discountAmount);
        console.log(`Applied discount of ${appliedDiscountPercentage}%. New total: ${total}`);
      }
    }
    
    // Create order in the database
    const order = await storage.createOrder({
      userId: req.user.id,
      status: 'pending',
      total: total, // Updated to use numeric value directly since this error is fixed in the schema
      shippingAddress,
      discountCode: discountCode, // Save the discount code with the order
    });
    
    const orderId = order.id;
    console.log(`Created order ${orderId} for user ${req.user.id}`);
    
    // Create order items
    for (const item of items) {
      await storage.createOrderItem({
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        variantInfo: item.variantInfo,
      });
    }
    
    console.log(`Added ${items.length} items to order ${orderId}`);
    
    // Generate payment link with Square
    const paymentResult = await createOrderPaymentLink(
      orderId,
      req.user.id,
      total,
      req.user.email,
      items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      discountCode // Pass the discount code to createOrderPaymentLink
    );
    
    return res.json(paymentResult);
    
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

/**
 * Check payment status for an order
 */
router.get('/verify-payment/:orderId/:paymentLinkId', async (req, res) => {
  try {
    // Require authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { orderId, paymentLinkId } = req.params;
    
    // Verify the payment status
    const result = await verifyOrderPayment(paymentLinkId, orderId);
    
    return res.json(result);
    
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
});



/**
 * Get an order by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    const order = await storage.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // For security, verify the user owns the order or is an admin
    const isAdmin = req.user && req.user.role === 'admin';
    if (req.user && !isAdmin && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get order items
    const items = await storage.getOrderItems(orderId);
    
    // Get product details for each item
    const itemsWithProductDetails = await Promise.all(
      items.map(async (item) => {
        if (item.productId) {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            product
          };
        }
        return item;
      })
    );
    
    // Return the order with items
    return res.json({
      ...order,
      items: itemsWithProductDetails
    });
    
  } catch (error) {
    console.error('Error fetching order:', error);
    return res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * Get all orders (for admin use)
 */
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    console.log('Admin requested all orders');
    const orders = await storage.getAllOrders();
    return res.json(orders);
  } catch (error) {
    console.error('Error fetching all orders:', error);
    return res.status(500).json({ error: 'Failed to fetch all orders' });
  }
});

/**
 * Get all orders for the current user
 */
router.get('/', async (req, res) => {
  try {
    // Require authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user is admin and wants all orders
    if (req.user.role === 'admin' && req.query.all === 'true') {
      console.log('Admin requested all orders via query parameter');
      
      // Get all orders
      const orders = await storage.getAllOrders();
      
      // For each order, fetch and attach its items with product details
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await storage.getOrderItems(order.id);
          
          // Get product details for each item
          const itemsWithProductDetails = await Promise.all(
            items.map(async (item) => {
              if (item.productId) {
                const product = await storage.getProduct(item.productId);
                return {
                  ...item,
                  product
                };
              }
              return item;
            })
          );
          
          return {
            ...order,
            items: itemsWithProductDetails
          };
        })
      );
      
      return res.json(ordersWithItems);
    }
    
    // Regular user or admin not requesting all orders
    const orders = await storage.getOrdersByUserId(req.user.id);
    
    // For each order, fetch and attach its items with product details
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        
        // Get product details for each item
        const itemsWithProductDetails = await Promise.all(
          items.map(async (item) => {
            if (item.productId) {
              const product = await storage.getProduct(item.productId);
              return {
                ...item,
                product
              };
            }
            return item;
          })
        );
        
        return {
          ...order,
          items: itemsWithProductDetails
        };
      })
    );
    
    return res.json(ordersWithItems);
    
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * Validate a store discount code
 */
router.post('/validate-discount', async (req, res) => {
  try {
    // Require authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: "Discount code is required" 
      });
    }
    
    // Validate the discount code
    const discountPercentage = await validateStoreDiscountCode(code);
    
    console.log(`Validated store discount code "${code}", percentage: ${discountPercentage}%`);
    
    res.json({
      success: true,
      valid: discountPercentage > 0,
      discountPercentage,
      message: discountPercentage > 0 
        ? `Discount of ${discountPercentage}% will be applied at checkout` 
        : 'Invalid discount code'
    });
  } catch (err) {
    console.error("Error validating store discount code:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to validate discount code" 
    });
  }
});

/**
 * Update order status (for admin use)
 */
router.patch('/:id', async (req, res) => {
  try {
    // Require authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    // Get the existing order
    const order = await storage.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // For security, verify the user owns the order or is an admin
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get the updated fields from the request body
    const { status, trackingNumber, trackingUrl } = req.body;
    
    // Store the previous status for notification
    const previousStatus = order.status;
    
    // Validate the status if provided
    if (status) {
      // Import OrderStatus directly instead of using require
      const { OrderStatus } = await import('../../shared/schema');
      if (!Object.values(OrderStatus).includes(status)) {
        return res.status(400).json({ error: 'Invalid order status' });
      }
    }
    
    // Update the order
    const updateData: any = {};
    if (status) updateData.status = status;
    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (trackingUrl) updateData.trackingUrl = trackingUrl;
    
    // Only update if there are fields to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const updatedOrder = await storage.updateOrder(orderId, updateData);
    
    console.log(`Order ${orderId} updated by ${req.user.id} (${isAdmin ? 'admin' : 'owner'})`);
    
    // If status has changed, send email notification
    if (status && status !== previousStatus) {
      try {
        // Get the customer (user) of this order
        if (order.userId) {
          console.log(`Fetching user with ID ${order.userId} for email notification`);
          const customer = await storage.getUser(order.userId);
          
          if (customer && customer.email) {
            console.log(`Sending order status update email to ${customer.email} for order ${orderId}`);
            
            // Send email notification
            const emailResult = await sendOrderStatusUpdateEmail(
              updatedOrder, 
              previousStatus,
              customer.email
            );
            
            if (emailResult) {
              console.log(`Order status update email sent successfully to ${customer.email}`);
            } else {
              console.error(`Failed to send order status update email to ${customer.email}`);
            }
          } else {
            console.warn(`Customer email not found for order ${orderId}, cannot send notification`);
          }
        } else {
          console.warn(`UserId not found for order ${orderId}, cannot send notification`);
        }
      } catch (emailError) {
        // Log the error but don't fail the request
        console.error('Error sending order status update email:', emailError);
      }
    }
    
    return res.json(updatedOrder);
    
  } catch (error) {
    console.error('Error updating order:', error);
    return res.status(500).json({ error: 'Failed to update order' });
  }
});

/**
 * Track an order without requiring login (public endpoint)
 * Requires order ID and the email used for the order
 */
router.post('/track', async (req, res) => {
  try {
    console.log('Public order tracking request:', req.body);
    
    // Validate request body
    const result = TrackOrderSchema.safeParse(req.body);
    if (!result.success) {
      console.error('Order tracking validation failed:', result.error);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid tracking data',
        details: result.error.issues,
      });
    }
    
    const { orderId, email } = result.data;
    
    // Get the order
    const order = await storage.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }
    
    // Verify the order belongs to a user with the provided email
    if (order.userId) {
      const user = await storage.getUser(order.userId);
      
      // For security, verify the email matches
      if (!user || user.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ 
          success: false,
          error: 'The email address does not match our records for this order' 
        });
      }
    } else if (order.shippingAddress && order.shippingAddress.email) {
      // For guest checkouts, check the shipping address email
      if (order.shippingAddress.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ 
          success: false,
          error: 'The email address does not match our records for this order' 
        });
      }
    } else {
      // No way to verify the email
      return res.status(403).json({ 
        success: false,
        error: 'Unable to verify ownership of this order' 
      });
    }
    
    // Get order items
    const items = await storage.getOrderItems(orderId);
    
    // Get product details for each item
    const itemsWithProductDetails = await Promise.all(
      items.map(async (item) => {
        if (item.productId) {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            product
          };
        }
        return item;
      })
    );
    
    // Return the order with items
    return res.json({
      success: true,
      order: {
        ...order,
        items: itemsWithProductDetails,
        // Remove any sensitive data
        userId: undefined, 
      }
    });
    
  } catch (error) {
    console.error('Error tracking order:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to track order' 
    });
  }
});

export default router;