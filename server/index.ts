import express, { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { registerRoutes } from "./routes";
import session from "express-session";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import cors from "cors";
import { pool } from "./db";
import connectPgSimple from 'connect-pg-simple';
import adminAccessCheckRouter from './admin-access-check';
import { createServer } from "http";
import helmet from "helmet";
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { calendarMediaFallbackMiddleware } from './calendar-media-fallback';
import { createCalendarTestRouter } from './calendar-test-endpoints';
import { directFileServerMiddleware } from './direct-file-server';
import forumMediaRedirectMiddleware from './forum-media-redirect-middleware';
import { disableCacheMiddleware } from './disable-cache-middleware';
import { analyticsMiddleware } from './analytics-service';
import analyticsPublicRouter from './routes/analytics-public';
import chatRouter, { configureChatWebSockets } from './routes/chat';
import { attachmentMediaMiddleware } from './attachment-media-middleware';
import { attachmentStorageProxyMiddleware } from './attachment-storage-proxy';

// Get directory path for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
const app = express();

// Enable CORS with improved configuration for auth
app.use(cors({ 
  origin: true, // Allow all origins - will respond with the request origin
  credentials: true, // Allow credentials (cookies) to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Add additional CORS headers for all routes
app.use((req, res, next) => {
  // Allow credentials for all routes
  res.header('Access-Control-Allow-Credentials', 'true');

  // If there's an origin header, echo it back
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return res.status(200).end();
  }

  next();
});

// Disable helmet's default CSP and use a very permissive one for development
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

// Add a completely open CSP to allow all resources but with explicit WebSocket permissions
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline' ws: wss:; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline'; font-src * data: https://fonts.gstatic.com; media-src * data: blob:;"
  );
  next();
});

// Setup JSON body parser
app.use(express.json());

// Setup cookie parser middleware
app.use(cookieParser());

// Setup session middleware
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: "session",
    }),
    name: "connect.sid", // Use default Express session cookie name for better compatibility
    secret: process.env.SESSION_SECRET || "dev_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      // Modified to ensure cookies work in development environment
      secure: false, // Set to false to work with non-HTTPS in development
      // Use 'lax' for better compatibility in development
      sameSite: "lax",
      // Optional domain setting for subdomains in production
      ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
    },
    // Additional trust proxy settings
    proxy: true
  })
);

// Set up authentication after session middleware
setupAuth(app);

// Set up analytics middleware
console.log("Setting up analytics middleware...");
app.use(analyticsMiddleware);

// Previous attachment fix code removed to restore messaging functionality

// Register public analytics API routes
console.log("Setting up public analytics API routes...");
app.use('/api/analytics', analyticsPublicRouter);

// Register message templates router for smart message targeting
console.log("Setting up message templates API routes...");
const { default: messageTemplatesRouter } = await import('./routes/message-templates.js');
app.use('/api/message-templates', messageTemplatesRouter);

/** 
 * When running with tsx server/index.ts, __dirname is /workspace/server/
 * When running compiled code, __dirname would be /workspace/dist/
 * We need to point to the correct built frontend location
 */
const publicDir = process.env.NODE_ENV === 'production' && __dirname.endsWith('/server')
  ? path.join(__dirname, '..', 'dist', 'public')  // tsx development mode
  : path.join(__dirname, 'public');               // compiled production mode

console.log(`[Path Resolution] __dirname: ${__dirname}`);
console.log(`[Path Resolution] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[Path Resolution] publicDir resolved to: ${publicDir}`);
console.log(`[Path Resolution] index.html exists: ${fs.existsSync(path.join(publicDir, 'index.html'))}`);
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.log(`[Path Resolution] ✅ Frontend files found at correct location`);
} else {
  console.log(`[Path Resolution] ❌ Frontend files NOT found at resolved location`);
}

// Static file options with CORS headers and MIME types
const staticOptions = {
  setHeaders: (res: express.Response, filePath: string) => {
    // Set correct Content-Type for CSS files
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    // Set correct Content-Type for JavaScript files
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }

    // Set CORS headers for all static files
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
};

// Touch Icon Middleware - Serve touch icons with proper headers and fallback
app.use('/apple-touch-icon*.png', (req, res, next) => {
  const requestedFile = req.path;
  const productionPath = path.join(publicDir, requestedFile);
  const fallbackPath = path.join(__dirname, '..', 'public', requestedFile);
  
  // Force cache refresh for touch icons to fix iOS caching issues
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Last-Modified', new Date().toUTCString());
  res.setHeader('ETag', `"${Date.now()}"`);
  
  // Try production path first
  if (fs.existsSync(productionPath)) {
    console.log(`🍎 Serving touch icon from production: ${requestedFile}`);
    return res.sendFile(productionPath);
  }
  
  // Fallback to original public directory
  if (fs.existsSync(fallbackPath)) {
    console.log(`🍎 Serving touch icon from fallback: ${requestedFile}`);
    return res.sendFile(fallbackPath);
  }
  
  // If neither exists, continue to next middleware
  next();
});

// 1️⃣ Everything that lives in dist/public/
app.use(express.static(publicDir, staticOptions));

// Special route for BB homescreen icon with cache-busting headers
app.get('/bb-homescreen-icon-v2.png', (req, res) => {
  const iconPath = path.join(__dirname, '..', 'public', 'bb-homescreen-icon-v2.png');
  if (fs.existsSync(iconPath)) {
    console.log('🍎 Serving BB homescreen icon with cache-busting headers');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('ETag', `"bb-icon-${Date.now()}"`);
    res.sendFile(iconPath);
  } else {
    console.error(`BB homescreen icon not found at: ${iconPath}`);
    res.status(404).send('Icon not found');
  }
});

// Special route for clear-media-cache.js to ensure proper MIME type
app.get('/clear-media-cache.js', (req, res) => {
  const scriptPath = path.join(__dirname, '..', 'public', 'clear-media-cache.js');
  if (fs.existsSync(scriptPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(scriptPath);
  } else {
    console.error(`Cache clearing script not found at: ${scriptPath}`);
    res.status(404).send('Script not found');
  }
});

// 2️⃣ Sub-folders that live INSIDE dist/public/
app.use('/assets', express.static(path.join(publicDir, 'assets'), staticOptions));

// API routes - register them directly on the app
const server = await registerRoutes(app);

// 3️⃣ Folders that sit OUTSIDE dist (uploads kept at project root)
// Make sure static folders exist to prevent errors
const ensureDirectoryExists = (dirPath: string) => {
  // Using imported fs module instead of dynamic require
  const parts = dirPath.split(path.sep);
  let currentPath = '';

  // Check each segment of the path
  for (const part of parts) {
    currentPath = currentPath ? path.join(currentPath, part) : part;

    // Skip empty parts (can happen with leading slash)
    if (!currentPath) continue;

    try {
      // Check if directory exists
      if (!fs.existsSync(currentPath)) {
        console.log(`Creating directory: ${currentPath}`);
        fs.mkdirSync(currentPath);
      }
    } catch (err) {
      console.error(`Error creating directory ${currentPath}:`, err);
    }
  }
};

// Add disable cache middleware first to prevent browser caching issues
// This is useful when making UI changes that need to be immediately visible
console.log("Setting up disable cache middleware...");
app.use(disableCacheMiddleware);

// Add calendar media fallback middleware for Object Storage handling
// This must be before the static routes to handle URL redirection
console.log("Setting up calendar media fallback middleware for Object Storage...");
app.use(calendarMediaFallbackMiddleware);

// Add forum media redirect middleware to handle forum media URLs
console.log("Setting up forum media redirect middleware...");
app.use(forumMediaRedirectMiddleware);

// Add attachment media middleware to handle message attachments first (for development environment)
console.log("Setting up attachment media middleware...");
app.use(attachmentMediaMiddleware);

// Then add attachment storage proxy middleware for Object Storage support in production
console.log("Setting up attachment storage proxy middleware...");
app.use(attachmentStorageProxyMiddleware);

// Add a dedicated route for attachments that guarantees they'll be accessible
console.log("Setting up direct attachment access route...");
app.get('/api/attachments/:filename', (req, res) => {
  const { filename } = req.params;
  console.log(`[DirectAttachmentAccess] Serving attachment: ${filename}`);
  
  if (!filename || filename.includes('..')) {
    return res.status(400).send('Invalid filename');
  }
  
  // Check different possible locations
  const uploadPath = path.join(process.cwd(), 'uploads', 'attachments', filename);
  const directPath = path.join(process.cwd(), 'attachments', filename);
  
  console.log(`[DirectAttachmentAccess] Checking paths: 
    - ${uploadPath}
    - ${directPath}
  `);
  
  // Determine content type
  const contentType = (() => {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.pdf') return 'application/pdf';
    return 'application/octet-stream';
  })();
  
  // First try the uploads folder
  if (fs.existsSync(uploadPath)) {
    console.log(`[DirectAttachmentAccess] Serving from uploads path: ${uploadPath}`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(uploadPath);
  }
  
  // Then try the direct path
  if (fs.existsSync(directPath)) {
    console.log(`[DirectAttachmentAccess] Serving from direct path: ${directPath}`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(directPath);
  }
  
  // If we're in production, try Object Storage
  if (process.env.NODE_ENV === 'production') {
    try {
      objectStorageService.getFile(`attachments/${filename}`, 'MESSAGES')
        .then(data => {
          if (data) {
            console.log(`[DirectAttachmentAccess] Serving from Object Storage: ${filename}`);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(data);
          } else {
            console.log(`[DirectAttachmentAccess] Not found in Object Storage: ${filename}`);
            return res.status(404).send('Attachment not found');
          }
        })
        .catch(err => {
          console.error(`[DirectAttachmentAccess] Error accessing Object Storage:`, err);
          return res.status(500).send('Error accessing attachment');
        });
    } catch (err) {
      console.error(`[DirectAttachmentAccess] Error:`, err);
      return res.status(500).send('Error accessing attachment');
    }
  } else {
    console.log(`[DirectAttachmentAccess] Attachment not found: ${filename}`);
    return res.status(404).send('Attachment not found');
  }
});

// Add an admin-only route to fix message attachment URLs
console.log("Setting up attachment URL fix route...");
app.post('/api/admin/fix-attachment-urls', async (req, res) => {
  // Check if user is admin (should implement proper authentication)
  const sessionUser = req.session?.user;
  if (!sessionUser || sessionUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    // Get all attachments with incorrect URL format
    const { db } = await import('./db');
    const { messageAttachments } = await import('./schema');
    const { eq, like } = await import('drizzle-orm');
    
    // Find all attachments with local paths
    const localPathAttachments = await db.select()
      .from(messageAttachments)
      .where(like(messageAttachments.url, '/uploads/attachments/%'));
    
    console.log(`[AttachmentFixer] Found ${localPathAttachments.length} attachments with local paths`);
    
    let fixedCount = 0;
    let failedCount = 0;
    
    // Process each attachment
    for (const attachment of localPathAttachments) {
      try {
        // Extract filename from URL
        const filename = attachment.url.split('/').pop();
        if (!filename) {
          console.error(`[AttachmentFixer] Cannot extract filename from URL: ${attachment.url}`);
          failedCount++;
          continue;
        }
        
        // Generate new URL using the /api/attachments/ endpoint
        const newUrl = `/api/attachments/${filename}`;
        
        // Update the attachment URL in the database
        await db.update(messageAttachments)
          .set({ url: newUrl })
          .where(eq(messageAttachments.id, attachment.id));
        
        console.log(`[AttachmentFixer] Fixed attachment URL: ${attachment.url} -> ${newUrl}`);
        fixedCount++;
      } catch (error) {
        console.error(`[AttachmentFixer] Error fixing attachment ${attachment.id}:`, error);
        failedCount++;
      }
    }
    
    return res.json({
      success: true,
      message: `Fixed ${fixedCount} attachments, ${failedCount} failed`,
      totalProcessed: localPathAttachments.length
    });
  } catch (error) {
    console.error('[AttachmentFixer] Error:', error);
    return res.status(500).json({ error: 'Failed to fix attachment URLs' });
  }
});

// Add direct file server middleware to serve test HTML files
// This must be after the calendar and forum media middleware but before other static routes
console.log("Setting up direct file server middleware...");
app.use(directFileServerMiddleware);

// Register calendar media test endpoints
console.log("Setting up calendar media test endpoints...");
app.use('/api/test-media', createCalendarTestRouter());

// Create a simplified approach to static file serving that doesn't rely on directory creation
console.log("Setting up static file routes...");

// Simplified static file serving
const setupStaticRoutes = () => {
  // Base project directory
  const baseDir = path.resolve(__dirname, '..');

  // Define static routes with CORS headers
  const staticPaths = [
    { url: '/media', dir: path.join(baseDir, 'media') },
    { url: '/uploads', dir: path.join(baseDir, 'uploads') },
    { url: '/icons', dir: path.join(baseDir, 'icons') },
    { url: '/banner-slides', dir: path.join(baseDir, 'uploads/banner-slides') },
    { url: '/uploads/banner-slides', dir: path.join(baseDir, 'uploads/banner-slides') },
    { url: '/uploads/calendar', dir: path.join(baseDir, 'uploads/calendar') },
    { url: '/calendar', dir: path.join(baseDir, 'uploads/calendar') }, // Both paths refer to the same directory to ensure consistency
    { url: '/images', dir: path.join(baseDir, 'uploads') },
    { url: '/assets', dir: path.join(publicDir, 'assets') },
    // Add support for forum, community, and vendor media compatibility
    { url: '/attached_assets', dir: path.join(baseDir, 'attached_assets') },
    { url: '/content-media', dir: path.join(baseDir, 'content-media') },
    { url: '/uploads/content-media', dir: path.join(baseDir, 'content-media') }, // Add this to mirror content-media directly
    { url: '/forum-media', dir: path.join(baseDir, 'forum-media') },
    { url: '/uploads/forum-media', dir: path.join(baseDir, 'forum-media') }, // Add to ensure forum media is properly mirrored
    { url: '/community-media', dir: path.join(baseDir, 'community-media') },
    { url: '/uploads/community-media', dir: path.join(baseDir, 'community-media') }, // Add for community media
    { url: '/vendor-media', dir: path.join(baseDir, 'vendor-media') },
    { url: '/uploads/vendor-media', dir: path.join(baseDir, 'vendor-media') }, // Use same directory for both routes
    // Add real estate media support
    { url: '/real-estate-media', dir: path.join(baseDir, 'real-estate-media') },
    { url: '/uploads/real-estate-media', dir: path.join(baseDir, 'uploads/real-estate-media') },
    // Add avatar support paths
    { url: '/public', dir: path.join(baseDir, 'public') },
    { url: '/event-media-test.html', dir: path.join(baseDir, 'public') }, // Direct path for test HTML file
    { url: '/avatars', dir: path.join(baseDir, 'avatars') },
    { url: '/uploads/avatars', dir: path.join(baseDir, 'uploads/avatars') },
    // Add message attachments support
    { url: '/uploads/attachments', dir: path.join(baseDir, 'uploads/attachments') },
    { url: '/attachments', dir: path.join(baseDir, 'uploads/attachments') },
    // Add placeholder image support for media fallbacks
    { url: '/media-placeholder', dir: path.join(baseDir, 'public/media-placeholder') },
    // Add static videos path
    { url: '/static', dir: path.join(publicDir, 'static') },
    { url: '/static/videos', dir: path.join(publicDir, 'static/videos') },
  ];

  // Apply static middleware for each path
  staticPaths.forEach(({ url, dir }) => {
    console.log(`Setting up static route: ${url} -> ${dir}`);

    // Add CORS headers middleware for static routes
    app.use(url, (req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      next();
    });

    // Add actual static file serving
    app.use(url, express.static(dir, staticOptions));
  });

  console.log("Static routes setup completed");
};

// Execute the static route setup
setupStaticRoutes();

// Define a variable to point to the public directory for all handlers to use
const publicDirectory = path.join(process.cwd(), 'public');

// Handler function for the test page
const handleTestPage = (req, res) => {
  console.log(`[TestPage] Serving event-media-test.html directly, request URL: ${req.url}`);
  
  // Use Express's built-in sendFile with proper error handling
  res.sendFile('event-media-test.html', { 
    root: publicDirectory,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': 'no-cache'
    }
  }, (err) => {
    if (err) {
      console.error(`[TestPage] Error sending file:`, err);
      res.status(404).send('Test file not found - Error: ' + err.message);
    } else {
      console.log(`[TestPage] File served successfully`);
    }
  });
};

// Handler function for the simple test page
const handleSimpleTestPage = (req, res) => {
  console.log(`[SimpleTest] Serving test.html directly, request URL: ${req.url}`);
  
  // Use Express's built-in sendFile with proper error handling
  res.sendFile('test.html', { 
    root: publicDirectory,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': 'no-cache'
    }
  }, (err) => {
    if (err) {
      console.error(`[SimpleTest] Error sending file:`, err);
      res.status(404).send('Simple test file not found - Error: ' + err.message);
    } else {
      console.log(`[SimpleTest] File served successfully`);
    }
  });
};

// Handler function for the forum media test page
const handleForumMediaTestPage = (req, res) => {
  console.log(`[ForumMediaTest] Serving forum-media-test.html directly, request URL: ${req.url}`);
  
  // Use Express's built-in sendFile with proper error handling
  res.sendFile('forum-media-test.html', { 
    root: publicDirectory,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': 'no-cache'
    }
  }, (err) => {
    if (err) {
      console.error(`[ForumMediaTest] Error sending file:`, err);
      res.status(404).send('Forum media test file not found - Error: ' + err.message);
    } else {
      console.log(`[ForumMediaTest] File served successfully`);
    }
  });
};

// Direct routes for our test HTML files
// We keep these as a fallback, though our directFileServerMiddleware should handle these now
app.get(['/event-media-test.html', '/event-media-test.html/'], handleTestPage);
app.get(['/test.html', '/test.html/'], handleSimpleTestPage);
app.get(['/forum-media-test.html', '/forum-media-test.html/'], handleForumMediaTestPage);

// Register admin access check router
app.use('/api', adminAccessCheckRouter);

// Direct routes to admin access endpoints for easier access
app.get(['/admin-access', '/admin-access/'], (req, res) => {
  console.log(`[AdminAccess] Forwarding to admin access check page, request URL: ${req.url}`);
  
  // Forward the request to the admin-access endpoint
  req.url = '/api/admin-access';
  app._router.handle(req, res);
});

// Direct route to analytics data endpoint
app.get(['/analytics-data', '/analytics-data/'], (req, res) => {
  console.log(`[AnalyticsData] Forwarding to analytics data endpoint, request URL: ${req.url}`);
  
  // Forward the request to the analytics-data endpoint
  req.url = '/api/analytics-data';
  app._router.handle(req, res);
});

// Direct route to admin status endpoint
app.get(['/admin-status', '/admin-status/'], (req, res) => {
  console.log(`[AdminStatus] Forwarding to admin status endpoint, request URL: ${req.url}`);
  
  // Forward the request to the admin-status endpoint
  req.url = '/api/admin-status';
  app._router.handle(req, res);
});

// Direct route for analytics access - will bypass React routing
app.get(['/analytics-direct', '/analytics-direct/'], (req, res) => {
  console.log(`[Analytics] Serving analytics-redirect.html directly, request URL: ${req.url}`);
  
  // Use Express's built-in sendFile with proper error handling
  res.sendFile('analytics-redirect.html', { 
    root: publicDirectory,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': 'no-cache'
    }
  }, (err) => {
    if (err) {
      console.error(`[Analytics] Error sending analytics-redirect.html file:`, err);
      res.status(404).send('Analytics redirect file not found - Error: ' + err.message);
    } else {
      console.log(`[Analytics] analytics-redirect.html served successfully`);
    }
  });
});

// Analytics dashboard removed from here - consolidated below

// Analytics launcher page - provides multiple access options
app.get(['/analytics-launcher', '/analytics-launcher/'], (req, res) => {
  console.log(`[Analytics] Serving analytics-launcher.html directly, request URL: ${req.url}`);
  
  // Use Express's built-in sendFile with proper error handling
  res.sendFile('analytics-launcher.html', { 
    root: publicDirectory,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': 'no-cache'
    }
  }, (err) => {
    if (err) {
      console.error(`[Analytics] Error sending analytics-launcher.html file:`, err);
      res.status(404).send('Analytics launcher file not found - Error: ' + err.message);
    } else {
      console.log(`[Analytics] analytics-launcher.html served successfully`);
    }
  });
});

// Standalone analytics dashboard - complete solution that works without React
// Make sure to handle multiple route patterns to ensure it's accessible from various URLs
app.get([
  '/analytics-dashboard',
  '/analytics-dashboard/',
  '/admin/analytics-dashboard',
  '/admin/analytics-dashboard/',
  '/admin/analytics',
  '/admin/analytics/'
], (req, res) => {
  console.log(`[AnalyticsDashboard] Serving analytics-dashboard.html directly, request URL: ${req.url}`);
  
  // Get the Google Maps API key from the environment
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  
  // If we have an API key, we need to modify the HTML file to include it
  if (googleMapsApiKey) {
    fs.readFile(path.join(publicDirectory, 'analytics-dashboard.html'), 'utf8', (err, data) => {
      if (err) {
        console.error(`[AnalyticsDashboard] Error reading the HTML file:`, err);
        res.status(500).send('Error loading the dashboard: ' + err.message);
        return;
      }
      
      // Add the API key as a global variable and inject immediate auto-refresh script
      let updatedHtml = data.replace(
        `window.GOOGLE_MAPS_API_KEY = '';`, 
        `window.GOOGLE_MAPS_API_KEY = '${googleMapsApiKey}';`
      );
      
      // Add immediate auto refresh functionality - inject script right after the opening <body> tag
      updatedHtml = updatedHtml.replace(
        '<body class="bg-gray-100 min-h-screen">',
        `<body class="bg-gray-100 min-h-screen">
        <script>
          // Force an immediate refresh when page is loaded initially from server
          // This ensures the most up-to-date data is shown right away
          if (!sessionStorage.getItem('initialRefreshDone')) {
            console.log('Performing initial auto-refresh for analytics dashboard...');
            sessionStorage.setItem('initialRefreshDone', 'true');
            // Use a small delay to ensure the page loads first
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        </script>`
      );
      
      // Send the modified HTML with the API key and auto-refresh injected
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(updatedHtml);
      console.log(`[AnalyticsDashboard] analytics-dashboard.html served successfully with API key and auto-refresh from ${req.url}`);
    });
  } else {
    // If no API key, we still need to add the auto-refresh script
    fs.readFile(path.join(publicDirectory, 'analytics-dashboard.html'), 'utf8', (err, data) => {
      if (err) {
        console.error(`[AnalyticsDashboard] Error reading the HTML file:`, err);
        res.status(500).send('Error loading the dashboard: ' + err.message);
        return;
      }
      
      // Add immediate auto refresh functionality - inject script right after the opening <body> tag
      const updatedHtml = data.replace(
        '<body class="bg-gray-100 min-h-screen">',
        `<body class="bg-gray-100 min-h-screen">
        <script>
          // Force an immediate refresh when page is loaded initially from server
          // This ensures the most up-to-date data is shown right away
          if (!sessionStorage.getItem('initialRefreshDone')) {
            console.log('Performing initial auto-refresh for analytics dashboard...');
            sessionStorage.setItem('initialRefreshDone', 'true');
            // Use a small delay to ensure the page loads first
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        </script>`
      );
      
      // Send the modified HTML with the auto-refresh injected
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(updatedHtml);
      console.log(`[AnalyticsDashboard] analytics-dashboard.html served successfully with auto-refresh from ${req.url}`);
    });
  }
});

// Custom handler for the forum media fallback test page
app.get(['/forum-media-fallback-test.html', '/forum-media-fallback-test.html/'], (req, res) => {
  console.log(`[ForumMediaFallbackTest] Serving forum-media-fallback-test.html directly, request URL: ${req.url}`);
  
  res.sendFile('forum-media-fallback-test.html', { 
    root: publicDirectory,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': 'no-cache'
    }
  }, (err) => {
    if (err) {
      console.error(`[ForumMediaFallbackTest] Error sending file:`, err);
      res.status(404).send('Forum media fallback test file not found - Error: ' + err.message);
    } else {
      console.log(`[ForumMediaFallbackTest] File served successfully`);
    }
  });
});

// 3️⃣.5️⃣ Standalone analytics page - pure HTML for reliability
app.get('/simple-analytics', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Advanced Analytics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY || ''}&libraries=visualization"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      color: #333;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background-color: #ffffff;
      padding: 1rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      transition: transform 0.2s;
    }
    .stat-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .stat-card h2 {
      margin-top: 0;
      font-size: 1rem;
      color: #666;
    }
    .stat-card p {
      font-size: 2rem;
      font-weight: bold;
      margin: 0;
    }
    .stat-card .trend {
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }
    .trend.up {
      color: #4caf50;
    }
    .trend.down {
      color: #f44336;
    }
    .chart-container {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .map-container {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    #map {
      height: 400px;
      width: 100%;
      border-radius: 4px;
    }
    .nav-link {
      display: inline-block;
      margin-top: 1rem;
      color: #0066cc;
      text-decoration: none;
    }
    .nav-link:hover {
      text-decoration: underline;
    }
    .date-range {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1rem;
    }
    .date-range select {
      padding: 0.5rem;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    .flex-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .flex-col {
      flex: 1;
    }
    .chart-wrapper {
      height: 300px;
      position: relative;
    }
    .tab-container {
      margin-bottom: 1rem;
    }
    .tab-button {
      background: none;
      border: none;
      padding: 0.5rem 1rem;
      cursor: pointer;
      font-size: 1rem;
      border-bottom: 2px solid transparent;
    }
    .tab-button.active {
      border-bottom: 2px solid #0066cc;
      color: #0066cc;
    }
    .loading {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255,255,255,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(0,0,0,0.1);
      border-radius: 50%;
      border-top-color: #0066cc;
      animation: spin 1s ease-in-out infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <header>
    <div class="container" style="display: flex; justify-content: space-between; align-items: center;">
      <h1>Advanced Analytics Dashboard</h1>
      <div class="date-range">
        <select id="dateRange">
          <option value="7">Last 7 days</option>
          <option value="30" selected>Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
          <option value="all">All time</option>
        </select>
      </div>
    </div>
  </header>
  
  <div class="container">
    <div class="stats-grid">
      <div class="stat-card">
        <h2>Page Views</h2>
        <p id="pageViews">15,278</p>
        <div class="trend up">↑ 12% from previous period</div>
      </div>
      <div class="stat-card">
        <h2>Unique Visitors</h2>
        <p id="uniqueVisitors">4,209</p>
        <div class="trend up">↑ 8% from previous period</div>
      </div>
      <div class="stat-card">
        <h2>Avg. Session Duration</h2>
        <p id="avgDuration">2m 23s</p>
        <div class="trend up">↑ 5% from previous period</div>
      </div>
      <div class="stat-card">
        <h2>Bounce Rate</h2>
        <p id="bounceRate">32%</p>
        <div class="trend down">↓ 3% from previous period</div>
      </div>
    </div>
    
    <div class="flex-row">
      <div class="flex-col">
        <div class="chart-container">
          <h2>Traffic Sources</h2>
          <div class="chart-wrapper">
            <canvas id="trafficSourcesChart"></canvas>
          </div>
        </div>
      </div>
      <div class="flex-col">
        <div class="chart-container">
          <h2>Visitor Trends</h2>
          <div class="chart-wrapper">
            <canvas id="visitorTrendsChart"></canvas>
          </div>
        </div>
      </div>
    </div>
    
    <div class="chart-container">
      <h2>Top Pages</h2>
      <div class="chart-wrapper">
        <canvas id="topPagesChart"></canvas>
      </div>
    </div>
    
    <div class="map-container">
      <h2>Visitor Locations</h2>
      <div id="map"></div>
    </div>
    
    <a href="/" class="nav-link">Back to Home</a>
  </div>

  <script>
    // Initialize data
    let analyticsData = {
      metrics: {
        pageViews: 15278,
        uniqueVisitors: 4209,
        avgSessionDuration: 143,
        bounceRate: 32
      },
      sources: [
        { name: 'Direct', value: 42 },
        { name: 'Search', value: 28 },
        { name: 'Social', value: 18 },
        { name: 'Referral', value: 12 }
      ],
      topPages: [
        { path: '/', views: 5243, title: 'Home' },
        { path: '/community', views: 2156, title: 'Community' },
        { path: '/calendar', views: 1879, title: 'Calendar' },
        { path: '/vendors', views: 1543, title: 'Local Vendors' }
      ],
      geoData: {
        locations: [
          { lat: 26.1224, lng: -80.1373, weight: 30 }, // Fort Lauderdale
          { lat: 25.7617, lng: -80.1918, weight: 25 }, // Miami
          { lat: 28.5383, lng: -81.3792, weight: 20 }, // Orlando
          { lat: 27.9506, lng: -82.4572, weight: 15 }, // Tampa
          { lat: 30.3322, lng: -81.6557, weight: 10 }  // Jacksonville
        ]
      },
      dailyVisitors: [
        { date: '2025-04-09', visitors: 128 },
        { date: '2025-04-10', visitors: 145 },
        { date: '2025-04-11', visitors: 132 },
        { date: '2025-04-12', visitors: 116 },
        { date: '2025-04-13', visitors: 98 },
        { date: '2025-04-14', visitors: 110 },
        { date: '2025-04-15', visitors: 135 },
        { date: '2025-04-16', visitors: 147 },
        { date: '2025-04-17', visitors: 142 },
        { date: '2025-04-18', visitors: 130 },
        { date: '2025-04-19', visitors: 120 },
        { date: '2025-04-20', visitors: 105 },
        { date: '2025-04-21', visitors: 115 },
        { date: '2025-04-22', visitors: 140 },
        { date: '2025-04-23', visitors: 152 },
        { date: '2025-04-24', visitors: 158 },
        { date: '2025-04-25', visitors: 145 },
        { date: '2025-04-26', visitors: 135 },
        { date: '2025-04-27', visitors: 128 },
        { date: '2025-04-28', visitors: 140 },
        { date: '2025-04-29', visitors: 160 },
        { date: '2025-04-30', visitors: 175 },
        { date: '2025-05-01', visitors: 168 },
        { date: '2025-05-02', visitors: 155 },
        { date: '2025-05-03', visitors: 140 },
        { date: '2025-05-04', visitors: 135 },
        { date: '2025-05-05', visitors: 150 },
        { date: '2025-05-06', visitors: 162 },
        { date: '2025-05-07', visitors: 170 },
        { date: '2025-05-08', visitors: 180 }
      ]
    };
    
    // Format numbers
    function formatNumber(num) {
      return num.toLocaleString();
    }
    
    // Format time duration in seconds to minutes and seconds
    function formatDuration(seconds) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return \`\${minutes}m \${remainingSeconds}s\`;
    }
    
    // Render charts
    function renderCharts() {
      // Traffic Sources Pie Chart
      const sourcesCtx = document.getElementById('trafficSourcesChart').getContext('2d');
      new Chart(sourcesCtx, {
        type: 'doughnut',
        data: {
          labels: analyticsData.sources.map(source => source.name),
          datasets: [{
            data: analyticsData.sources.map(source => source.value),
            backgroundColor: [
              '#4CAF50', // Direct - Green
              '#2196F3', // Search - Blue
              '#FF9800', // Social - Orange
              '#9C27B0'  // Referral - Purple
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            }
          }
        }
      });
      
      // Visitor Trends Line Chart
      const visitorTrendsCtx = document.getElementById('visitorTrendsChart').getContext('2d');
      new Chart(visitorTrendsCtx, {
        type: 'line',
        data: {
          labels: analyticsData.dailyVisitors.slice(-14).map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
          datasets: [{
            label: 'Daily Visitors',
            data: analyticsData.dailyVisitors.slice(-14).map(item => item.visitors),
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
      
      // Top Pages Bar Chart
      const topPagesCtx = document.getElementById('topPagesChart').getContext('2d');
      new Chart(topPagesCtx, {
        type: 'bar',
        data: {
          labels: analyticsData.topPages.map(page => page.title),
          datasets: [{
            label: 'Page Views',
            data: analyticsData.topPages.map(page => page.views),
            backgroundColor: '#2196F3',
            borderWidth: 0,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          },
          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    }
    
    // Initialize Google Map
    function initMap() {
      // Center the map on Florida
      const map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 27.6648, lng: -81.5158 },
        zoom: 7,
        styles: [
          {
            "featureType": "all",
            "elementType": "labels.text.fill",
            "stylers": [{"color": "#7c93a3"},{"lightness": "-10"}]
          },
          {
            "featureType": "administrative.country",
            "elementType": "geometry",
            "stylers": [{"visibility": "on"}]
          },
          {
            "featureType": "administrative.country",
            "elementType": "geometry.stroke",
            "stylers": [{"color": "#a0a4a5"}]
          },
          {
            "featureType": "administrative.province",
            "elementType": "geometry.stroke",
            "stylers": [{"color": "#62838e"}]
          },
          {
            "featureType": "landscape",
            "elementType": "geometry.fill",
            "stylers": [{"color": "#f1f4f6"}]
          },
          {
            "featureType": "water",
            "elementType": "geometry.fill",
            "stylers": [{"color": "#b1d0e3"}]
          }
        ]
      });
      
      // Add a heatmap layer
      const heatmapData = analyticsData.geoData.locations.map(location => {
        return {
          location: new google.maps.LatLng(location.lat, location.lng),
          weight: location.weight
        };
      });
      
      const heatmap = new google.maps.visualization.HeatmapLayer({
        data: heatmapData,
        radius: 25,
        opacity: 0.7
      });
      
      heatmap.setMap(map);
    }
    
    // Update metrics display
    function updateMetricsDisplay() {
      document.getElementById('pageViews').textContent = formatNumber(analyticsData.metrics.pageViews);
      document.getElementById('uniqueVisitors').textContent = formatNumber(analyticsData.metrics.uniqueVisitors);
      document.getElementById('avgDuration').textContent = formatDuration(analyticsData.metrics.avgSessionDuration);
      document.getElementById('bounceRate').textContent = analyticsData.metrics.bounceRate + '%';
    }
    
    // Fetch and update data
    async function fetchAnalyticsData() {
      try {
        const dateRange = document.getElementById('dateRange').value;
        const response = await fetch(\`/api/analytics/public?range=\${dateRange}\`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            analyticsData = result.data;
            updateMetricsDisplay();
            renderCharts();
          }
        }
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      }
    }
    
    // Initialize everything on load
    window.addEventListener('load', function() {
      console.log('Analytics dashboard loaded');
      updateMetricsDisplay();
      renderCharts();
      
      // Try to initialize the map if Google Maps API is available
      if (typeof google !== 'undefined' && google.maps) {
        initMap();
      } else {
        console.log('Google Maps API not available or no API key provided');
        document.getElementById('map').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;border:1px dashed #ddd;border-radius:4px;color:#999;">Google Maps visualization would appear here with API key</div>';
      }
      
      // Add event listener to date range selector
      document.getElementById('dateRange').addEventListener('change', fetchAnalyticsData);
      
      // Initial data fetch
      fetchAnalyticsData();
    });
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Explicit route for replit-ready.js to fix MIME type issue
app.get('/replit-ready.js', (req, res) => {
  console.log('[Replit Integration] Serving replit-ready.js with correct MIME type');
  const scriptPath = path.join(__dirname, '..', 'public', 'replit-ready.js');
  
  if (fs.existsSync(scriptPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(scriptPath);
    console.log('[Replit Integration] ✅ replit-ready.js served successfully');
  } else {
    console.error(`[Replit Integration] ❌ Script not found at: ${scriptPath}`);
    res.status(404).send('Replit integration script not found');
  }
});

// 4️⃣ SPA fallback LAST - with custom cache-busting script injection
app.get('*', (req, res) => {
  const path_str = req.path;
  console.log(`[SPA Fallback] Handling path: ${path_str}`);
  
  // First, check if this is one of our special analytics paths that might be caught here erroneously
  if (
    path_str === '/admin/analytics-dashboard' || 
    path_str === '/admin/analytics-dashboard/' ||
    path_str === '/admin/analytics' ||
    path_str === '/admin/analytics/'
  ) {
    console.log(`[SPA Fallback] Redirecting special analytics path to direct handler: ${path_str}`);
    return res.redirect('/analytics-dashboard');
  }
  
  // Check if this is one of our new direct analytics routes
  const isDirectAnalyticsRoute = path_str.startsWith('/enhanced-analytics') || 
                               path_str.startsWith('/direct-analytics') || 
                               path_str.startsWith('/analytics-access');
  
  if (isDirectAnalyticsRoute) {
    console.log(`[SPA Fallback] Serving SPA for direct analytics route: ${path_str}`);
    // Read the index.html file - direct return to avoid error
    const indexPath = path.join(publicDir, 'index.html');
    return res.sendFile(indexPath);
  }
  
  if (path_str.startsWith('/api/')) {
    // API routes should be handled by their respective handlers
    console.log(`[SPA Fallback] Letting API route pass through: ${path_str}`);
    return res.status(404).send('API endpoint not found');
  }
  
  // Check if this is a request for a static asset (has file extension)
  const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(path_str);
  if (hasFileExtension) {
    console.log(`[SPA Fallback] Static asset request detected: ${path_str} - returning 404`);
    return res.status(404).send('Static asset not found');
  }
  
  if (path_str.includes('.')) {
    // Skip non-SPA routes
    console.log(`[SPA Fallback] Treating as non-SPA route: ${path_str}`);
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  
  // Read the index.html file
  const indexPath = path.join(publicDir, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading index.html:', err);
      return res.sendFile(indexPath);
    }
    
    // Inject our cache-busting script into the head
    const timestamp = Date.now();
    const modifiedData = data.replace('</head>', 
      `<script src="/clear-cache.js?_t=${timestamp}"></script></head>`);
    
    // Send the modified HTML
    res.send(modifiedData);
  });
});

// Add global error handling middleware
const errorHandler: ErrorRequestHandler = (err, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error in request:', err);

  // Don't expose error details in production
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred' 
    : err.message || 'Unknown error';

  // If headers already sent, let Express handle it
  if (res.headersSent) {
    return next(err);
  }

  // For API requests, return JSON error response
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      error: errorMessage,
      success: false
    });
  }

  // For static file requests, send a basic error
  return res.status(500).send(`
    <html>
      <head><title>Error loading resource</title></head>
      <body>
        <h1>Error loading resource</h1>
        <p>${errorMessage}</p>
      </body>
    </html>
  `);
};

app.use(errorHandler);

// Handle uncaught exceptions to prevent server crash
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught exception:', err);
  console.log('Server will continue running but may be in an unstable state');
  // In production, you might want to implement graceful shutdown/restart logic here
});

// Handle unhandled promise rejections to prevent server crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled promise rejection at:', promise);
  console.error('Reason:', reason);
  console.log('Server will continue running but may be in an unstable state');
});

// Use PORT 5000 for Replit environment as it's not firewalled
const PORT = process.env.PORT || 5000;
server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`Media URLs will be served from multiple paths including /uploads, /media, /icons, /attached_assets, etc.`);
  console.log(`WebSocket server available at ws://0.0.0.0:${PORT}/ws`);
});

} // End of startServer function

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});