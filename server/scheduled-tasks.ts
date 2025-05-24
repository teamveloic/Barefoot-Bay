/**
 * Scheduled Tasks Service
 * 
 * This module handles background/scheduled tasks for the application, such as:
 * - Checking for Printful order status updates
 * - Checking for expired real estate listings
 * - Sending automated emails based on status changes
 * - Synchronizing inventory data
 */

import { storage } from './storage';
import * as printfulService from './printful-service';
import { sendOrderStatusUpdateEmail } from './email-service';
import { OrderStatus } from '@shared/schema';
import { checkExpiredListings } from './listing-expiration-service';
import { updateExpiredSubscriptions } from './user-subscriptions';
import { processMembershipOrders } from './utils/membership-processor';
import { logTransaction } from './utils/square-logger';
import { getSquareClient } from './square-client';

// Map Printful status to our application's order status
const printfulStatusMap: Record<string, OrderStatus> = {
  'draft': OrderStatus.PROCESSING,
  'pending': OrderStatus.PROCESSING,
  'failed': OrderStatus.FAILED,
  'canceled': OrderStatus.CANCELLED,
  'on_hold': OrderStatus.PROCESSING,
  'fulfilled': OrderStatus.SHIPPED,
  'archived': OrderStatus.COMPLETED,
  'partially_fulfilled': OrderStatus.PARTIALLY_SHIPPED
};

// Status descriptions for email notifications
const statusDescriptions: Record<string, string> = {
  [OrderStatus.PENDING]: 'Your order has been received and is pending payment.',
  [OrderStatus.PROCESSING]: 'Your order is being processed.',
  [OrderStatus.SHIPPED]: 'Your order has been shipped!',
  [OrderStatus.DELIVERED]: 'Your order has been delivered.',
  [OrderStatus.COMPLETED]: 'Your order is complete.',
  [OrderStatus.CANCELLED]: 'Your order has been cancelled.',
  [OrderStatus.FAILED]: 'There was an issue with your order.',
  [OrderStatus.PARTIALLY_SHIPPED]: 'Part of your order has been shipped.',
  [OrderStatus.REFUNDED]: 'Your order has been refunded.'
};

/**
 * Check status of a single Printful order and update our database
 */
export async function checkPrintfulOrderStatus(orderId: number, printfulOrderId: string): Promise<boolean> {
  try {
    console.log(`Checking Printful status for order ${orderId} (Printful ID: ${printfulOrderId})`);
    
    // Get current order from our database
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.error(`Order ${orderId} not found in database`);
      return false;
    }
    
    // Get status from Printful
    const printfulResponse = await printfulService.getOrderStatus(parseInt(printfulOrderId));
    if (!printfulResponse || !printfulResponse.result) {
      console.error(`Failed to get status for Printful order ${printfulOrderId}`);
      return false;
    }
    
    const printfulOrder = printfulResponse.result;
    console.log(`Retrieved Printful order ${printfulOrderId} with status: ${printfulOrder.status}`);
    
    // Convert Printful status to our status format
    if (printfulOrder.status && printfulStatusMap[printfulOrder.status]) {
      const newStatus = printfulStatusMap[printfulOrder.status];
      
      // Only update if status has changed
      if (newStatus !== order.status) {
        console.log(`Status change detected for order ${orderId}: ${order.status} -> ${newStatus}`);
        
        const previousStatus = order.status;
        
        // Update order record in our database
        const updateData: any = {
          status: newStatus
        };
        
        // If there's tracking info, update that too
        if (printfulOrder.shipments && printfulOrder.shipments.length > 0) {
          const latestShipment = printfulOrder.shipments[0];
          if (latestShipment.tracking_number) {
            updateData.trackingNumber = latestShipment.tracking_number;
          }
          if (latestShipment.tracking_url) {
            updateData.trackingUrl = latestShipment.tracking_url;
          }
        }
        
        // Update the order in our database
        await storage.updateOrder(orderId, updateData);
        console.log(`Updated order ${orderId} with new status: ${newStatus}`);
        
        // Send email notification about status change
        try {
          // Get the customer (user) of this order
          if (order.userId) {
            const customer = await storage.getUser(order.userId);
            
            if (customer && customer.email) {
              console.log(`Sending order status update email to ${customer.email} for order ${orderId}`);
              
              // Include updated order details
              const updatedOrder = await storage.getOrder(orderId);
              
              // Send email notification
              const emailResult = await sendOrderStatusUpdateEmail(
                updatedOrder || order, 
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
          }
        } catch (emailError) {
          console.error('Error sending order status update email:', emailError);
        }
        
        return true;
      } else {
        console.log(`No status change for order ${orderId}, current status: ${order.status}`);
      }
    } else {
      console.warn(`Unknown Printful status: ${printfulOrder.status} for order ${printfulOrderId}`);
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking Printful order status for order ${orderId}:`, error);
    return false;
  }
}

/**
 * Check all pending Printful orders for status updates
 */
export async function checkAllPrintfulOrders(): Promise<number> {
  try {
    console.log('Checking all pending Printful orders for status updates...');
    
    // Get all orders that have a Printful order ID and are in an active state
    const activeStatuses = [
      OrderStatus.PENDING,
      OrderStatus.PROCESSING,
      OrderStatus.PARTIALLY_SHIPPED
    ];
    
    const orders = await storage.getOrdersByStatus(activeStatuses);
    console.log(`Found ${orders.length} active orders to check for Printful updates`);
    
    // Filter orders that have a printful order ID
    const printfulOrders = orders.filter(order => !!order.printProviderOrderId);
    console.log(`Found ${printfulOrders.length} Printful orders to check for updates`);
    
    let updatedCount = 0;
    
    // Check each order
    for (const order of printfulOrders) {
      try {
        const wasUpdated = await checkPrintfulOrderStatus(order.id, order.printProviderOrderId);
        if (wasUpdated) {
          updatedCount++;
        }
      } catch (orderError) {
        console.error(`Error processing Printful order ${order.id}:`, orderError);
        // Continue with other orders even if this one fails
      }
    }
    
    console.log(`Completed Printful order status check. Updated ${updatedCount} orders.`);
    return updatedCount;
  } catch (error) {
    console.error('Error checking Printful orders:', error);
    return 0;
  }
}

/**
 * Run all scheduled tasks
 * This function will be called by the scheduler
 */
export async function runScheduledTasks(): Promise<void> {
  console.log('Running scheduled tasks...');
  
  try {
    // Check Printful orders
    await checkAllPrintfulOrders();
    
    // Check for expired real estate listings
    try {
      console.log('Checking for expired real estate listings...');
      const expirationResult = await checkExpiredListings();
      console.log(`Checked ${expirationResult.checked} listings: ${expirationResult.expired} expired`);
    } catch (listingError) {
      console.error('Error checking expired listings:', listingError);
      // Continue with other tasks even if this one fails
    }
    
    // Check for expired user subscriptions
    try {
      console.log('Checking for expired user subscriptions...');
      const subscriptionResult = await updateExpiredSubscriptions();
      console.log(`Checked and updated ${subscriptionResult.count} expired user subscriptions`);
    } catch (subscriptionError) {
      console.error('Error checking expired subscriptions:', subscriptionError);
      // Continue with other tasks even if this one fails
    }
    
    // Process membership orders from completed store purchases
    try {
      console.log('Processing membership orders...');
      
      // First make sure we have a valid Square client
      const squareClient = getSquareClient();
      
      if (!squareClient || !squareClient.client) {
        console.error('Failed to initialize Square client for membership processing');
        console.log('Membership order processing skipped due to missing Square client');
      } else {
        // Process with valid client
        const result = await processMembershipOrders(storage, squareClient);
        
        if (result.processed > 0) {
          logTransaction('SCHEDULED_MEMBERSHIP_PROCESSING', {
            timestamp: new Date().toISOString(),
            result
          });
        }
        
        console.log(`Membership order processing complete: Processed ${result.processed} pending orders, ${result.failed} failed`);
      }
    } catch (membershipError) {
      console.error('Error processing membership orders:', membershipError);
      // Continue with other tasks even if this one fails
    }
    
    console.log('Scheduled tasks completed successfully');
  } catch (error) {
    console.error('Error running scheduled tasks:', error);
  }
}

export default {
  checkPrintfulOrderStatus,
  checkAllPrintfulOrders,
  runScheduledTasks,
  processMembershipOrders
};