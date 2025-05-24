/**
 * Utility functions for handling media paths in different environments
 */

/**
 * Check if running in a production environment
 * @returns boolean indicating if this is a production environment
 */
export function isProductionEnvironment(): boolean {
  return typeof window !== 'undefined' && 
    (window.location.hostname.includes('replit.app') || 
     window.location.hostname.includes('barefootbay.com'));
}

/**
 * Convert a media URL to the appropriate format based on environment
 * @param url The media URL to convert
 * @param mediaType The media type folder (e.g., 'banner-slides', 'calendar')
 * @returns Normalized URL appropriate for the current environment
 */
export function getEnvironmentAppropriateUrl(url: string, mediaType: string = 'banner-slides'): string {
  if (!url) return url;
  
  // Extract the filename from any format
  let fileName;

  // If it's already an Object Storage URL, prioritize that over other formats
  if (url.includes('object-storage.replit.app')) {
    // Object Storage URLs are already environment-appropriate, so just return as-is
    return url;
  }
  // Extract from standard paths
  else if (url.startsWith(`/uploads/${mediaType}/`)) {
    fileName = url.replace(`/uploads/${mediaType}/`, '');
  } else if (url.startsWith(`/${mediaType}/`)) {
    fileName = url.replace(`/${mediaType}/`, '');
  } else {
    // If it's in an unrecognized format, just return it as is
    return url;
  }
  
  // IMPORTANT: For banner slides, we now prioritize Object Storage URLs
  // to ensure correct URL format and persistence across deployments
  if (mediaType === 'banner-slides') {
    // Use the BANNER bucket for banner slides
    const bucket = 'BANNER';
    return `https://object-storage.replit.app/${bucket}/${mediaType}/${fileName}`;
  }
  
  // For other media types, use the original environment detection
  if (isProductionEnvironment()) {
    // In production, use the format without /uploads/
    return `/${mediaType}/${fileName}`;
  } else {
    // In development, use the /uploads/ prefix
    return `/uploads/${mediaType}/${fileName}`;
  }
}

/**
 * Convert an array of banner slides to use environment-appropriate URLs
 * @param slides Array of banner slides
 * @returns Updated slides with environment-appropriate URLs
 */
export function convertBannerSlidePaths<T extends { src?: string }>(slides: T[]): T[] {
  return slides.map(slide => {
    if (!slide.src) return slide;
    
    return {
      ...slide,
      src: getEnvironmentAppropriateUrl(slide.src, 'banner-slides')
    };
  });
}