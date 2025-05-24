/**
 * Provides Square application credentials safely for client-side usage
 * This prevents exposing the full access token to the client, only sharing
 * the application ID and location ID which are needed for Square Web Payments SDK
 */

/**
 * Get the Square application and location IDs for client-side initialization
 * @returns Object containing applicationId and locationId
 */
export function getSquareAppInfo() {
  if (!process.env.SQUARE_APPLICATION_ID || !process.env.SQUARE_LOCATION_ID) {
    console.error('Missing required Square environment variables: SQUARE_APPLICATION_ID or SQUARE_LOCATION_ID');
    return {
      success: false,
      error: 'Square payment configuration is incomplete',
    };
  }

  return {
    success: true,
    applicationId: process.env.SQUARE_APPLICATION_ID,
    locationId: process.env.SQUARE_LOCATION_ID,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
  };
}