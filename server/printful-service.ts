/**
 * Printful API Service
 * 
 * This service handles all communication with the Printful API for print-on-demand functionality.
 * It provides methods for:
 * - Fetching product catalog
 * - Creating mockups 
 * - Placing orders
 * - Checking shipping rates
 * - Syncing inventory
 */

import fetch from "node-fetch";
import { z } from "zod";
import fs from "fs";
import path from "path";

const PRINTFUL_API_URL = "https://api.printful.com";

// Configuration file path
const CONFIG_FILE = path.join(process.cwd(), "config", "print-service.json");

// Get Printful configuration (API key and store ID)
const getPrintfulConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (configData && configData.serviceProvider === "printful") {
        return {
          apiKey: configData.apiKey || process.env.PRINTFUL_API_KEY || null,
          storeId: configData.storeId || process.env.PRINTFUL_STORE_ID || "15683048"
        };
      }
    }
  } catch (error) {
    console.error("Error reading print service config:", error);
  }
  
  // Fall back to environment variables if config file not found or valid
  return {
    apiKey: process.env.PRINTFUL_API_KEY || null,
    storeId: process.env.PRINTFUL_STORE_ID || "15683048"
  };
};

// Get configuration values
const printfulConfig = getPrintfulConfig();
const PRINTFUL_API_KEY = printfulConfig.apiKey;
const PRINTFUL_STORE_ID = printfulConfig.storeId;

// Headers for all Printful API requests
const getHeaders = () => {
  if (!PRINTFUL_API_KEY) {
    console.warn("Printful API key not found. Printful integration will not work.");
  }
  
  return {
    "Authorization": `Bearer ${PRINTFUL_API_KEY}`,
    "Content-Type": "application/json",
    "X-PF-API-Version": "1"
  };
};

// Generic function to handle API responses
const handleResponse = async (response: Response) => {
  // Check if response is OK
  if (!response.ok) {
    // Try to parse error message
    let errorText = "";
    try {
      const errorData = await response.json();
      errorText = errorData.result || errorData.error || JSON.stringify(errorData);
    } catch (e) {
      errorText = await response.text();
    }
    
    throw new Error(`Printful API Error (${response.status}): ${errorText}`);
  }
  
  // Parse and return JSON response
  return await response.json();
};

/**
 * Get all available products from Printful catalog
 */
export const getProductCatalog = async () => {
  // Use the catalog endpoint which doesn't require a store_id
  const response = await fetch(`${PRINTFUL_API_URL}/products`, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Get store-specific products
 * These are the products that have been added to your specific store
 */
export const getStoreProducts = async () => {
  try {
    console.log('Getting store products from Printful API...');
    console.log(`Using store ID: ${PRINTFUL_STORE_ID}`);
    
    // Use the sync endpoint instead of store/products since it doesn't require additional parameters
    // This endpoint automatically uses the store ID from the API key
    const response = await fetch(`${PRINTFUL_API_URL}/sync/products`, {
      method: "GET",
      headers: getHeaders()
    });
    
    // Log the status code
    console.log(`Printful API response status: ${response.status}`);
    
    // Handle any unsuccessful status codes
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Printful API Error: ${response.status} - ${errorText}`);
      throw new Error(`Printful API Error (${response.status}): ${errorText}`);
    }
    
    // Parse and return successful response
    const data = await response.json();
    console.log('Successfully retrieved store products from Printful API');
    console.log(`Found ${data.result ? data.result.length : 0} products`);
    return data;
  } catch (error) {
    console.error('Error fetching Printful store products:', error);
    throw error;
  }
};

/**
 * Get variants for a specific product
 */
export const getProductVariants = async (productId: number) => {
  // Use catalog endpoint which doesn't require store_id
  const response = await fetch(`${PRINTFUL_API_URL}/products/${productId}`, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Create a mockup for a product with a design
 */
export const createMockup = async (variantId: number, placement: string, imageUrl: string) => {
  try {
    // First, get product variant info from catalog (doesn't require store_id)
    const variantInfoResponse = await fetch(`${PRINTFUL_API_URL}/products/variant/${variantId}`, {
      method: "GET",
      headers: getHeaders()
    });
    
    const variantInfo = await handleResponse(variantInfoResponse);
    console.log(`Got variant info for ${variantId}: ${JSON.stringify(variantInfo.result)}`);
    
    // Then create a task for the mockup generation
    const taskResponse = await fetch(`${PRINTFUL_API_URL}/mockup-generator/create-task/${variantId}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        variant_ids: [variantId],
        format: "jpg",
        files: [
          {
            placement,
            image_url: imageUrl,
            position: {
              area_width: 1800,
              area_height: 1800,
              width: 1800,
              height: 1800,
              top: 0,
              left: 0
            }
          }
        ]
      })
    });
    
    const taskResult = await handleResponse(taskResponse);
    const taskId = taskResult.result.task_key;
    
    // Now poll the task until it's complete
    let mockupResult = null;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check task status
      const statusResponse = await fetch(`${PRINTFUL_API_URL}/mockup-generator/task?task_key=${taskId}`, {
        method: "GET",
        headers: getHeaders()
      });
      
      const statusResult = await handleResponse(statusResponse);
      
      // If task is complete, return result
      if (statusResult.result.status === "completed") {
        mockupResult = statusResult.result;
        break;
      }
      
      // If task failed, throw error
      if (statusResult.result.status === "failed") {
        throw new Error(`Mockup generation failed: ${statusResult.result.error}`);
      }
    }
    
    if (!mockupResult) {
      throw new Error("Mockup generation timed out");
    }
    
    return mockupResult;
  } catch (error) {
    console.error("Error creating mockup:", error);
    throw error;
  }
};

/**
 * Calculate shipping rates for an order
 */
export const calculateShipping = async (items: any[], address: any) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/shipping/rates?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      recipient: address,
      items
    })
  });
  
  return handleResponse(response);
};

/**
 * Create and submit an order to Printful
 */
export const createOrder = async (items: any[], recipient: any, shipping: string) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/orders?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      recipient,
      items,
      shipping
    })
  });
  
  return handleResponse(response);
};

/**
 * Get all orders for the store
 * @param {Object} options - Query options for filtering orders
 */
export const getOrders = async (options: { status?: string; offset?: number; limit?: number } = {}) => {
  // Build query string from options
  const queryParams = new URLSearchParams();
  
  // Always include store_id parameter
  queryParams.append('store_id', PRINTFUL_STORE_ID);
  
  if (options.status) {
    queryParams.append('status', options.status);
  }
  
  if (options.offset) {
    queryParams.append('offset', options.offset.toString());
  }
  
  if (options.limit) {
    queryParams.append('limit', options.limit.toString());
  }
  
  const queryString = `?${queryParams.toString()}`;
  
  console.log(`Making request to ${PRINTFUL_API_URL}/orders${queryString}`);
  
  const response = await fetch(`${PRINTFUL_API_URL}/orders${queryString}`, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Get information about a specific order
 */
export const getOrderStatus = async (orderId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/orders/${orderId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Get store information
 */
export const getStore = async () => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Add a product to your Printful store
 * @param {Object} productData - Product data including sync variants
 */
export const addStoreProduct = async (productData: any) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(productData)
  });
  
  return handleResponse(response);
};

/**
 * Get information about a specific store product
 * @param {number} productId - Printful store product ID
 */
export const getStoreProduct = async (productId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Update an existing product in your Printful store
 * @param {number} productId - Printful store product ID
 * @param {Object} productData - Updated product data
 */
export const updateStoreProduct = async (productId: number, productData: any) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(productData)
  });
  
  return handleResponse(response);
};

/**
 * Delete a product from your Printful store
 * @param {number} productId - Printful store product ID
 */
export const deleteStoreProduct = async (productId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Get product variants for a specific store product
 * @param {number} productId - Printful store product ID
 */
export const getStoreProductVariants = async (productId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}/variants?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Create a new variant for a store product
 * @param {number} productId - Printful store product ID
 * @param {Object} variantData - Variant data
 */
export const createStoreProductVariant = async (productId: number, variantData: any) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}/variants?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(variantData)
  });
  
  return handleResponse(response);
};

/**
 * Update a specific product variant
 * @param {number} productId - Printful store product ID
 * @param {number} variantId - Variant ID
 * @param {Object} variantData - Updated variant data
 */
export const updateStoreProductVariant = async (productId: number, variantId: number, variantData: any) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}/variants/${variantId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(variantData)
  });
  
  return handleResponse(response);
};

/**
 * Delete a specific product variant
 * @param {number} productId - Printful store product ID
 * @param {number} variantId - Variant ID
 */
export const deleteStoreProductVariant = async (productId: number, variantId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}/variants/${variantId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Check inventory levels for a specific store product
 * @param {number} productId - Printful store product ID
 */
export const getProductInventory = async (productId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/store/products/${productId}/variants?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Sync all products from external store to Printful
 * This helps ensure product data is consistent between your store and Printful
 */
export const syncProducts = async () => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/sync/products?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Get information about a specific synced product
 * @param {number} syncProductId - Printful sync product ID
 */
export const getSyncProduct = async (syncProductId: number) => {
  // Construct URL with store_id parameter
  const url = `${PRINTFUL_API_URL}/sync/products/${syncProductId}?store_id=${PRINTFUL_STORE_ID}`;
  console.log(`Making request to Printful API: ${url}`);
  
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });
  
  return handleResponse(response);
};

/**
 * Test API connection and get available information
 */
export const testConnection = async () => {
  try {
    // First test basic API connectivity - stores endpoint doesn't need store_id
    console.log(`Making request to Printful API for stores list: ${PRINTFUL_API_URL}/stores`);
    const response = await fetch(`${PRINTFUL_API_URL}/stores`, {
      method: "GET",
      headers: getHeaders()
    });
    
    const storesData = await handleResponse(response);
    
    // Then try to get product catalog to verify catalog API works
    // The catalog endpoint doesn't need store_id either
    console.log(`Making request to Printful API for catalog: ${PRINTFUL_API_URL}/products`);
    const catalogResponse = await fetch(`${PRINTFUL_API_URL}/products`, {
      method: "GET",
      headers: getHeaders()
    });
    
    const catalogData = await handleResponse(catalogResponse);
    
    // Try to get current store info (with store_id)
    let currentStore = null;
    try {
      // Construct URL with store_id parameter
      const url = `${PRINTFUL_API_URL}/store?store_id=${PRINTFUL_STORE_ID}`;
      console.log(`Making request to Printful API for store info: ${url}`);
      
      const storeResponse = await fetch(url, {
        method: "GET",
        headers: getHeaders()
      });
      
      if (storeResponse.ok) {
        const storeData = await handleResponse(storeResponse);
        currentStore = storeData.result;
      }
    } catch (storeError) {
      console.warn("Could not get current store info:", storeError.message);
    }
    
    // Return combined information
    return {
      code: 200,
      result: {
        connected: true,
        apiKeyValid: true,
        stores: storesData.result || [],
        currentStore,
        storeId: PRINTFUL_STORE_ID,
        catalogItemCount: catalogData.result.length,
        setupGuide: "See PRINTFUL_SETUP_GUIDE.md for instructions on setting up your Printful store"
      }
    };
  } catch (error) {
    console.error("Error testing Printful connection:", error);
    return {
      code: 500,
      result: {
        connected: false,
        error: error.message,
        setupGuide: "See PRINTFUL_SETUP_GUIDE.md for instructions on setting up your Printful store"
      }
    };
  }
};