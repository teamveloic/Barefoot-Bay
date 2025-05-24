/**
 * Vendor URL Converter Utility
 * 
 * This utility provides functions to convert between database slug format (with hyphens)
 * and public URL format (with slashes).
 * 
 * Key principles:
 * 1. The unique-identifier portion ALWAYS matches the vendor's TITLE field.
 * 2. When either TITLE or CATEGORY changes, the slug automatically updates.
 * 3. URL format is always /vendors/[category]/[unique-identifier] (with slashes)
 * 4. Database slug format is always vendors-[category]-[unique-identifier] (with hyphens)
 */

// Known compound categories that include hyphens within the category name
export const COMPOUND_CATEGORIES = [
  'home-services',
  'food-and-dining',
  'food-dining',
  'health-and-medical',
  'health-wellness',
  'professional-services',
  'real-estate-and-senior-living',
  'real-estate',
  'anchor-and-vapor-barrier',
  'anchor-vapor',
  'anchor-vapor-barrier',
  'hvac-and-air-quality',
  'hvac-and',
  'health-and',
  'funeral-and-religious-services',
  'funeral-and',
  'moving-and-transportation',
  'moving-and',
  'insurance-and-financial-services',
  'insurance-financial',
  'technology-and-electronics',
  'technology-electronics',
  'retail-and-shops',
  'retail-shops',
  'beauty-and-personal-care',
  'beauty-personal-care',
  'automotive-and-golf-carts',
  'automotive-golf-carts',
  'new-homes-installation'
];

/**
 * Converts a database slug to a public URL format
 * @param slug Database slug format (eg: vendors-category-name)
 * @returns Public URL format (/vendors/category/name)
 */
export function dbSlugToPublicUrl(slug: string): string {
  if (!slug) return 'vendors';
  if (!slug.startsWith('vendors-')) return `vendors/${slug}`;
  
  // All vendor URL conversions now use the universal approach
  // No special case handling for specific vendors is required
  
  // Handle all Technology-and-Electronics vendors consistently
  if (slug.startsWith('vendors-technology-and-electronics-')) {
    console.log('🔄 URL Converter: Standard handling for Technology vendor');
    const uniqueId = slug.substring('vendors-technology-and-electronics-'.length);
    return `vendors/technology-and-electronics/${uniqueId}`;
  }
  
  // Handle all Landscaping vendors consistently
  if (slug.startsWith('vendors-landscaping-')) {
    console.log('🔄 URL Converter: Standard handling for Landscaping vendor');
    const uniqueId = slug.substring('vendors-landscaping-'.length);
    return `vendors/landscaping/${uniqueId}`;
  }
  
  // Remove the 'vendors-' prefix
  const withoutPrefix = slug.substring(8);
  
  // Check for compound categories first - this is critical for correct URL formatting
  for (const compound of COMPOUND_CATEGORIES) {
    if (withoutPrefix.startsWith(`${compound}-`)) {
      // Get everything after the compound category as the unique identifier
      const uniqueIdentifier = withoutPrefix.substring(compound.length + 1);
      
      // Special handling for compound categories with detailed logging
      if (compound === 'technology-and-electronics') {
        console.log(`Technology vendor: ${slug} → vendors/technology-and-electronics/${uniqueIdentifier}`);
      }
      
      // Return without leading slash to prevent double-slash issues
      return `vendors/${compound}/${uniqueIdentifier}`;
    }
  }
  
  // If no compound category was found, split by first hyphen to separate category/identifier
  const parts = withoutPrefix.split('-');
  
  // Handle special case where there's only one part
  if (parts.length === 1) {
    return `vendors/${parts[0]}`;
  }
  
  // For non-compound categories, the first element is the category
  const category = parts[0];
  
  // Everything else is part of the unique identifier
  const uniqueIdentifier = parts.slice(1).join('-');
  
  // Do extra logging for debugging in case of common categories
  console.log(`Standard vendor: ${slug} → vendors/${category}/${uniqueIdentifier}`);
  
  // Return without leading slash to prevent double-slash issues
  return `vendors/${category}/${uniqueIdentifier}`;
}

/**
 * Converts a public URL to a database slug format
 * @param url Public URL format (/vendors/category/name)
 * @returns Database slug format (vendors-category-name)
 */
export function publicUrlToDbSlug(url: string): string {
  if (!url) return '';
  if (!url.startsWith('/vendors/')) return '';
  
  // Remove leading slash and split by remaining slashes
  const parts = url.substring(1).split('/');
  if (parts.length < 3) return '';
  
  // All vendor URL conversions now use the universal approach
  // No special case handling for specific vendors is required
  
  // Handle all technology vendors consistently, even when URL is broken into incorrect segments
  if ((parts[1] === 'technology' && parts[2] === 'and-electronics' && parts.length > 3) || 
      (parts[1] === 'technology' && parts[2] === 'and' && parts[3] === 'electronics' && parts.length > 4)) {
    
    // Get the proper uniqueIdentifier depending on URL format
    let uniqueIdentifier;
    if (parts[2] === 'and-electronics') {
      uniqueIdentifier = parts[3];
      console.log(`🛠️ URL to DB slug: Handling hyphenated technology URL format: ${uniqueIdentifier}`);
    } else {
      uniqueIdentifier = parts[4];
      console.log(`🛠️ URL to DB slug: Handling split technology URL format: ${uniqueIdentifier}`);
    }
    
    return `vendors-technology-and-electronics-${uniqueIdentifier}`;
  }
  
  // Handle technology-and-electronics as a compound category
  if (parts[1] === 'technology-and-electronics' && parts.length > 2) {
    console.log(`🛠️ URL to DB slug: Standard technology vendor conversion: ${parts[2]}`);
    return `vendors-technology-and-electronics-${parts[2]}`;
  }
  
  // Handle landscaping vendors specifically
  if (parts[1] === 'landscaping' && parts.length > 2) {
    console.log(`🛠️ URL to DB slug: Standard landscaping vendor conversion: ${parts[2]}`);
    return `vendors-landscaping-${parts[2]}`;
  }
  
  // The category is the middle part
  const category = parts[1];
  
  // The unique identifier is the last part
  const uniqueIdentifier = parts[2];
  
  // Check for compound categories with "and" that might be split incorrectly
  if (parts.length > 3 && parts[2] === 'and') {
    // This is likely a case like /vendors/category/and/name which should be 
    // vendors-category-and-name in the database
    return `vendors-${category}-and-${parts[3]}-${parts.slice(4).join('-')}`;
  }
  
  // Add extra logging for debugging all vendor URL conversions
  console.log(`🛠️ URL to DB slug: Converting standard URL: ${url} to vendors-${category}-${uniqueIdentifier}`);
  
  // Format as vendors-category-uniqueIdentifier
  return `vendors-${category}-${uniqueIdentifier}`;
}

/**
 * Determines if a slug needs to be repaired for consistency
 * @param slug The database slug to check
 * @returns true if the slug needs repair, false if it's properly formatted
 */
export function needsSlugRepair(slug: string): boolean {
  if (!slug) return false;
  if (!slug.startsWith('vendors-')) return true;
  
  // Check for double hyphens that might indicate formatting issues
  if (slug.includes('--')) return true;
  
  // Check for redundant category prefixes
  const parts = slug.split('-');
  if (parts.length < 3) return false;
  
  // If we have vendors-category-category-name pattern, needs repair
  if (parts[1] === parts[2]) return true;
  
  // Check for compound categories with duplicate terms
  for (const compound of COMPOUND_CATEGORIES) {
    if (slug.startsWith(`vendors-${compound}-`)) {
      const compoundParts = compound.split('-');
      const remainingSlug = slug.substring(`vendors-${compound}-`.length);
      
      // Check for all possible duplicate patterns
      // 1. Check if the first part of the remaining slug matches the last part of the compound
      // Example: vendors-technology-and-electronics-electronics-computer
      if (compoundParts.length > 1 && remainingSlug.startsWith(`${compoundParts[compoundParts.length-1]}-`)) {
        return true;
      }
      
      // 2. Check if it starts with "and-" followed by the last compound part
      // Example: vendors-technology-and-electronics-and-electronics-computer
      if (compoundParts.length > 2 && 
          compoundParts[compoundParts.length-2] === 'and' && 
          remainingSlug.startsWith(`and-${compoundParts[compoundParts.length-1]}-`)) {
        return true;
      }
      
      // Special check for all technology-and-electronics vendors
      if (compound === 'technology-and-electronics') {
        console.log(`🔍 Checking technology vendor slug format: ${remainingSlug}`);
        
        // Check for redundant category prefixes
        if (remainingSlug.startsWith('technology-') || 
            remainingSlug.startsWith('electronics-') ||
            remainingSlug.startsWith('and-electronics-')) {
          console.log(`🔧 Technology vendor slug needs repair: ${remainingSlug}`);
          return true;
        }
      }
      
      // Check for all categories using the same universal approach
      if (compound === 'landscaping') {
        console.log(`🔍 Checking landscaping vendor slug format: ${remainingSlug}`);
        
        // For landscaping vendors that have "landscaping" prefix, they need repair
        if (remainingSlug.startsWith('landscaping-')) {
          console.log(`🔧 Landscaping vendor slug needs repair: ${remainingSlug}`);
          return true;
        }
      }
      
      // 3. Check if the entire compound is duplicated at the start of remainingSlug
      // Example: vendors-technology-electronics-technology-electronics-computer
      if (remainingSlug.startsWith(`${compound}-`)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Generates a slug from the title and category
 * @param title The vendor title
 * @param category The category name
 * @returns A properly formatted database slug
 */
export function generateVendorSlug(title: string, category: string): string {
  if (!title || !category) return '';
  
  // Format category first (lowercase, replace & with and, convert spaces to hyphens)
  let categorySlug = category.toLowerCase()
    .replace(/&/g, 'and')     // Replace & with and
    .replace(/[^\w\s-]/g, '') // Remove special chars except hyphens
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
    .trim();                  // Trim leading/trailing spaces
  
  // Format title to slug (lowercase, replace spaces with hyphens, etc.)
  const titleSlug = title.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  
  // Check if category is in our list of known compound categories
  // If not, but it contains hyphens, add it to our known list to ensure correct URL formatting
  if (categorySlug.includes('-') && !COMPOUND_CATEGORIES.includes(categorySlug)) {
    console.log(`📌 Adding new compound category to known list: ${categorySlug}`);
    COMPOUND_CATEGORIES.push(categorySlug);
  }
  
  // Special logging for known categories to help with debugging
  if (categorySlug === 'technology-and-electronics') {
    console.log(`✨ Creating Technology vendor slug: vendors-${categorySlug}-${titleSlug}`);
  } else if (categorySlug === 'landscaping') {
    console.log(`✨ Creating Landscaping vendor slug: vendors-${categorySlug}-${titleSlug}`);
  } else {
    console.log(`✨ Creating vendor slug in category "${categorySlug}": vendors-${categorySlug}-${titleSlug}`);
  }
  
  // Create the properly formatted database slug - this format must be consistent
  // to ensure URLs are properly formed when displayed
  return `vendors-${categorySlug}-${titleSlug}`;
}

/**
 * Repairs a malformed vendor slug
 * @param slug The possibly malformed slug
 * @param category The correct category to use 
 * @param title The vendor title (used to ensure unique-identifier matches title)
 * @returns A properly formatted slug
 */
export function repairVendorSlug(slug: string, category: string, title?: string): string {
  // If we have a title, always generate a fresh slug from title and category
  // This is the most accurate approach that ensures consistent formatting
  if (title) {
    console.log(`🔧 Repairing vendor slug with title and category: "${title}" (${category})`);
    return generateVendorSlug(title, category);
  }
  
  // Handle empty slug by returning empty string
  if (!slug) return '';
  
  // If slug doesn't start with vendors-, treat it as a title and generate fresh
  if (!slug.startsWith('vendors-')) {
    console.log(`🔧 Converting non-vendor slug to proper format: ${slug} → vendors-${category}-${slug}`);
    return generateVendorSlug(slug, category);
  }
  
  // Format the category slug consistently (same logic as in generateVendorSlug)
  const categorySlug = category.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  
  // All vendor slugs are processed using the universal approach
  // No special case handling for specific vendors is required
  
  // Extract everything after "vendors-" prefix
  const remaining = slug.substring(8);
  
  // Add detailed logging for debugging
  console.log(`🔧 Repairing vendor slug: ${slug} with category ${categorySlug}`);
  
  // Check for compound categories (most common case)
  if (categorySlug.includes('-')) {
    // Special case for technology-and-electronics
    if (categorySlug === 'technology-and-electronics') {
      // Get the parts after the category
      const afterCategory = remaining.substring(categorySlug.length + 1); // +1 for the hyphen
      console.log(`🔨 Repairing Technology vendor with identifier: ${afterCategory}`);
      
      // Create a properly formatted slug
      return `vendors-${categorySlug}-${afterCategory}`;
    } 
    // Special case for landscaping
    else if (categorySlug === 'landscaping') {
      // Get the parts after the category
      const afterCategory = remaining.substring(categorySlug.length + 1); // +1 for the hyphen
      console.log(`🔨 Repairing Landscaping vendor with identifier: ${afterCategory}`);
      
      // Create a properly formatted slug
      return `vendors-${categorySlug}-${afterCategory}`;
    }
    // General case for other compound categories
    else {
      // Get the parts after the category
      const afterCategory = remaining.substring(categorySlug.length + 1); // +1 for the hyphen
      console.log(`🔨 Repairing compound category vendor (${categorySlug}) with identifier: ${afterCategory}`);
      
      // Create a properly formatted slug
      return `vendors-${categorySlug}-${afterCategory}`;
    }
  }
  
  // For non-compound categories, split by first hyphen
  const parts = remaining.split('-');
  
  // Skip the category part and use the rest as unique identifier
  const uniqueIdentifier = parts.slice(1).join('-');
  
  console.log(`🔨 Repairing standard vendor with category ${categorySlug} and identifier: ${uniqueIdentifier}`);
  
  // Create the properly formatted slug
  return `vendors-${categorySlug}-${uniqueIdentifier}`;
}