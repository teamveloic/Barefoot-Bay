/**
 * Printful Sync Service
 * 
 * This module provides synchronization functionality between Printful and our local database.
 * It ensures that products from Printful are properly reflected in our local database
 * so they can be shown in the storefront.
 */

import * as printfulService from './printful-service';
import { storage } from './storage';
import { ProductCategory, ProductStatus, PrintProvider } from '@shared/schema';

/**
 * Maps Printful product types to our internal product categories
 * @param printfulType - The product type from Printful
 * @returns The product category as a string
 */
/**
 * Maps Printful product types to our internal product categories
 * Ensures we return a valid category from our enum
 * @param printfulType - The product type from Printful
 * @returns A valid product category from our enum
 */
function mapPrintfulTypeToCategory(printfulType: string): "apparel" | "home" | "accessories" {
  if (!printfulType) {
    return "accessories"; // Default category if type is undefined
  }
  
  printfulType = printfulType.toLowerCase();
  
  if (printfulType.includes('shirt') || 
      printfulType.includes('hoodie') || 
      printfulType.includes('sweater') || 
      printfulType.includes('jacket') ||
      printfulType.includes('apparel')) {
    return "apparel";
  }
  
  if (printfulType.includes('mug') || 
      printfulType.includes('pillow') || 
      printfulType.includes('poster') || 
      printfulType.includes('canvas') ||
      printfulType.includes('home')) {
    return "home";
  }
  
  // Default to accessories for other product types
  return "accessories";
}

/**
 * Converts price from Printful format to our database format
 * @param printfulPrice - Price from Printful API (in cents)
 * @returns number - Price in dollars
 */
function convertPrintfulPrice(printfulPrice: string | number): number {
  const price = typeof printfulPrice === 'string' ? 
    parseFloat(printfulPrice) : printfulPrice;
  
  // Printful returns prices in cents, convert to dollars with 2 decimal precision
  return parseFloat((price / 100).toFixed(2));
}

/**
 * Get a retail price based on the Printful price with markup
 * @param printfulPrice - Base price from Printful
 * @returns number - Retail price with markup
 */
function calculateRetailPrice(printfulPrice: number): number {
  // Add a 40% markup to the Printful price
  const markup = 1.4;
  return parseFloat((printfulPrice * markup).toFixed(2));
}

/**
 * Synchronizes a single Printful sync product with our local database
 * @param syncProduct - Product data from Printful sync API
 */
export async function syncPrintfulProduct(syncProduct: any): Promise<void> {
  try {
    console.log(`Syncing Printful product: ${syncProduct.name} (ID: ${syncProduct.id})`);
    
    // Check if product already exists in our database by printProviderId
    const existingProducts = await storage.getProductsByProviderId(syncProduct.id.toString());
    
    // Check if there are variants directly in the syncProduct
    const hasVariants = syncProduct.variants && syncProduct.variants.length > 0;
    
    // If there aren't variants directly in the sync product, let's check if there's a sync_variants field
    // which might contain the variant information in a nested structure
    if (!hasVariants && (!syncProduct.sync_variants || syncProduct.sync_variants.length === 0)) {
      // Log the entire syncProduct object to help debug what's available
      console.log('Product structure without variants:', JSON.stringify(syncProduct, null, 2));
      console.warn(`Product ${syncProduct.name} has no variants. Will try to create it with default values.`);
      
      // Instead of skipping, we'll create a basic product entry with default values
      // We'll provide a default variant for pricing
      syncProduct.variants = [{
        retail_price: '19.99',
        name: syncProduct.name,
        product: {
          id: syncProduct.id,
          type: syncProduct.product ? syncProduct.product.type : 'apparel'
        }
      }];
    }
    
    // Now get the first variant (which might be the default one we just created)
    const firstVariant = syncProduct.variants[0];
    
    // Prepare product data
    const basePrice = convertPrintfulPrice(firstVariant.retail_price);
    
    // Get product type - handle potential missing product property
    const productType = syncProduct.product && syncProduct.product.type 
      ? syncProduct.product.type 
      : 'apparel'; // Default to apparel if type is missing
    
    // Resolve thumbnail URL or use a default placeholder
    const thumbnailUrl = syncProduct.thumbnail_url 
      ? syncProduct.thumbnail_url 
      : 'https://cdn.printful.com/upload/product-catalog/85/852cf52aece9a5ff2f2f5fe4bb76f012_t?v=1678168023';
    
    const productData = {
      name: syncProduct.name,
      description: syncProduct.description || `${syncProduct.name} - Barefoot Bay merchandise`,
      price: basePrice.toString(), // Convert to string to match schema
      category: mapPrintfulTypeToCategory(productType),
      imageUrls: [thumbnailUrl], // Always provide at least one image URL
      status: ProductStatus.ACTIVE,
      printProviderId: syncProduct.id.toString(),
      printProvider: PrintProvider.PRINTFUL,
      designUrls: [], // Add empty arrays for required fields
      mockupUrls: [],
      variantData: {
        sync_product_id: syncProduct.id,
        external_id: syncProduct.external_id || syncProduct.id.toString(),
        variants: syncProduct.variants.map((v: any) => ({
          id: v.id || 0,
          product_id: v.product && v.product.id ? v.product.id : 0,
          name: v.name || syncProduct.name,
          size: v.size || 'One Size',
          color: v.color || 'Default',
          price: convertPrintfulPrice(v.retail_price),
          sku: v.sku || `PF-${syncProduct.id}-${Math.floor(Math.random() * 1000)}`
        }))
      }
    };
    
    // Update existing or create new
    if (existingProducts.length > 0) {
      // Update the existing product
      const existingProduct = existingProducts[0];
      console.log(`Updating existing product ${existingProduct.id}`);
      
      await storage.updateProduct(existingProduct.id, {
        ...productData,
        // Preserve any custom imageUrls if they exist
        imageUrls: existingProduct.imageUrls && existingProduct.imageUrls.length > 0 ? 
          existingProduct.imageUrls : productData.imageUrls
      });
    } else {
      // Create a new product
      console.log(`Creating new product: ${productData.name}`);
      await storage.createProduct(productData);
    }
    
    console.log(`Successfully synced product: ${syncProduct.name}`);
  } catch (error) {
    console.error(`Error syncing product ${syncProduct.name}:`, error);
    throw error;
  }
}

/**
 * Synchronizes all Printful products with our local database
 */
export async function syncAllPrintfulProducts(): Promise<number> {
  try {
    console.log('Starting full Printful product sync...');
    
    // Get all sync products from Printful
    const response = await printfulService.syncProducts();
    
    if (!response || !response.result) {
      console.error('No products returned from Printful sync API');
      return 0;
    }
    
    const syncProducts = response.result;
    console.log(`Found ${syncProducts.length} products to sync from Printful`);
    
    // Process each product
    let syncedCount = 0;
    for (const product of syncProducts) {
      try {
        await syncPrintfulProduct(product);
        syncedCount++;
      } catch (error) {
        console.error(`Error syncing product ${product.name}:`, error);
        // Continue with other products even if one fails
      }
    }
    
    console.log(`Completed Printful sync. Successfully synced ${syncedCount} products.`);
    return syncedCount;
  } catch (error) {
    console.error('Error in full Printful product sync:', error);
    throw error;
  }
}