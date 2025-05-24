import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './services/analytics-service';

/**
 * Analytics middleware to track page views and visits
 * This middleware will be applied to all routes to capture analytics data
 */
export const analyticsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip tracking for certain paths
    const skipPatterns = [
      /^\/(api|assets|static|favicon|robots|manifest)/i, // API and static assets
      /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i, // Static file extensions
      /^\/analytics\//i, // Analytics routes (to avoid recursion)
    ];

    if (skipPatterns.some(pattern => pattern.test(req.path))) {
      return next();
    }

    // Get or create session ID from cookie
    let sessionId = req.cookies?.['analytics_session_id'];
    
    if (!sessionId) {
      // Parse user agent manually without UAParser
      const userAgent = req.headers['user-agent'] as string;
      
      // Simple detection of device type and browser
      const deviceType = detectDeviceType(userAgent);
      const browser = detectBrowser(userAgent);
      
      // Start a new session
      sessionId = await analyticsService.startSession({
        userId: req.user?.id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || '127.0.0.1',
        userAgent: userAgent,
        deviceType: deviceType,
        browser: browser,
        referrer: req.headers.referer || null,
        entryPage: req.path,
        properties: {
          screen: req.headers['sec-ch-viewport-width'] 
                  ? { width: req.headers['sec-ch-viewport-width'], height: req.headers['sec-ch-viewport-height'] }
                  : undefined,
          language: req.headers['accept-language']
        }
      });
      
      // Set session cookie (24-hour expiration)
      res.cookie('analytics_session_id', sessionId, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    // Track page view (we do this in the background without waiting)
    analyticsService.trackPageView({
      sessionId,
      url: req.path,
      title: req.path, // We don't have the page title in the middleware
      properties: {
        query: req.query,
        method: req.method,
        isAuthenticated: req.isAuthenticated?.() || false
      }
    }).catch(err => {
      console.error('Error tracking page view in middleware:', err);
    });
    
    // Continue to the next middleware
    next();
  } catch (error) {
    console.error('Error in analytics middleware:', error);
    // Don't block the request, just continue
    next();
  }
};

/**
 * Simple function to detect device type from user agent
 */
function detectDeviceType(userAgent: string): string {
  if (!userAgent) return 'unknown';
  
  userAgent = userAgent.toLowerCase();
  
  if (userAgent.match(/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i)) {
    return 'mobile';
  } else if (userAgent.match(/tablet|ipad/i)) {
    return 'tablet';
  } else {
    return 'desktop';
  }
}

/**
 * Simple function to detect browser from user agent
 */
function detectBrowser(userAgent: string): string {
  if (!userAgent) return 'unknown';
  
  userAgent = userAgent.toLowerCase();
  
  if (userAgent.includes('edge') || userAgent.includes('edg')) {
    return 'Edge';
  } else if (userAgent.includes('chrome')) {
    return 'Chrome';
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    return 'Safari';
  } else if (userAgent.includes('firefox')) {
    return 'Firefox';
  } else if (userAgent.includes('msie') || userAgent.includes('trident')) {
    return 'Internet Explorer';
  } else {
    return 'Unknown';
  }
}

// Export the analytics service for direct usage
export { analyticsService };