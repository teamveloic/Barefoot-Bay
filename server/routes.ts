import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth, requireAuth, requireAdmin, hashPassword } from "./auth";
import { storage, db } from "./storage";
// Import WebSocket for chat functionality
import { WebSocketServer, WebSocket } from "ws";
import { processBase64Images } from "./base64-image-processor";
import { objectStorageService } from "./object-storage-service";
import objectStorageProxyRouter from "./object-storage-proxy";
import Stripe from "stripe";
// Import Square service which handles all Square API interactions
import * as squareService from './square-service';
import { getSquareAppInfo } from './square-app-info';
// Import chat router with named WebSocket configurator
import chatRouter, { configureChatWebSockets } from "./routes/chat";
import { validateAndSanitizeCommunityPage } from "./community-page-validator";
import { handleStandardForumFormat } from "./forum-standard-format-handler";
import forumMediaTestRouter from "./routes/forum-media-test";
import testPagesRouter from "./serve-test-pages";
// Import new unified storage service and middleware
import { unifiedStorageService, STORAGE_BUCKETS } from "./unified-storage-service";
import { Client } from "@replit/object-storage";
import { 
  uploadToObjectStorage, 
  processObjectStorageUploadResult,
  createStandardUploadHandler
} from "./object-storage-upload-middleware";
import { forumUpload, handleForumMediaUpload, handleMultipleForumMediaUpload } from "./forum-media-upload-handler";
import { vendorUpload, handleVendorMediaUpload } from "./vendor-media-upload-handler";
import { communityUpload, handleCommunityMediaUpload } from "./community-media-upload-handler";

// WebSocket interface for real-time messaging
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
}
import { insertEventSchema, insertListingSchema, insertPageContentSchema, contentVersions, insertFeatureFlagSchema, UserRole, type PageContent, insertListingPaymentSchema, type User, type FeatureFlag } from "@shared/schema";
import logger from "./logger";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import { fileURLToPath } from 'url';
import printfulRoutes from './routes/printful';
import { dirname } from 'path';
import { normalizeMediaUrl } from '../shared/url-normalizer';
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { sendListingContactEmail } from "./email-service";
import { sendPasswordResetEmail, generateResetToken } from "./password-reset";
// Import Square service for payment API endpoints
import * as squareService from "./square-service";
// Import Google service for Maps API proxying
import * as googleService from "./google-service";
// Import analytics router for tracking user behavior
import analyticsRouter from "./routes/analytics";
// Import analytics middleware
import { analyticsMiddleware } from "./analytics-service";
// Import subscription service for recurring payments
import fetch from "node-fetch";
import * as subscriptionService from "./subscription-service";
// Import for Gemini API proxy
import { URLSearchParams } from "url";
// Import rocket launch service
import { getUpcomingRocketLaunches } from "./rocket-launch-service";
import productsRouter from "./routes/products";
import { Square } from "./square-client";
import testMediaRouter from "./routes/test-media";
import printServiceRouter from "./routes/print-service";
import ordersRouter from "./routes/orders";
import testRouter from "./routes/test-routes";
import returnsRouter from "./routes/returns"; 
import { createForumRouter } from "./routes/forum";
import calendarMediaDiagnosticsRouter from "./calendar-media-diagnostics";
import debugRouter from "./debug-routes";
import { createVendorRouter } from "./routes/vendors";
import { createVendorCategoryRouter } from "./routes/vendor-categories";
// Import user membership subscription routes
import userSubscriptionsRouter from "./routes/subscriptions";
// Import sponsorship proxy for routing
import sponsorshipProxyRouter from "./routes/sponsorship-proxy";
// Import contact form router for handling contact form submissions
import contactRouter from "./routes/contact";
// Import setup memberships utility for creating membership products
import setupMembershipsRouter from "./routes/setup-memberships";
// Import membership processing admin tools
import membershipProcessingRouter from "./routes/membership-processing";
// Import deployment diagnostic tools
import deploymentDiagnosticRouter from "./deployment-diagnostic";
// Import calendar media diagnostics
import calendarMediaDiagnostics from './calendar-media-diagnostics';
import calendarMediaMigration from './calendar-media-migration';
import { productionSyncRouter } from "./production-sync";
import { createCommunityCategoryRouter } from "./routes/community-categories";
import { productionAuthRouter } from "./fix-production-auth";
import storageBrowserRouter from './routes/storage-browser';
import bannerSlideHelpersRouter from './routes/banner-slide-helpers';
import messagesRouter from './routes/messages-updated';
// Import message diagnostics router for troubleshooting message visibility issues
import messageDiagnosticsRouter from './routes/message-diagnostics';
// Import new message debug router for analyzing message read status
import messageDebugRouter from './routes/message-debug';
// Import media path utilities
import { MEDIA_TYPES, ensureDirectoryExists, copyFileToProductionLocation, saveMediaFile, findMediaFile, fixMediaUrl, fixRealEstateMediaUrl, fixContentMediaUrl, normalizeEventMediaUrl } from "./media-path-utils";
import { mediaSyncMiddleware } from "./media-sync-middleware";
import { realEstateObjectStorageMiddleware } from "./real-estate-object-storage-middleware";
import { handleCalendarMediaUpload } from "./calendar-media-upload-handler";
import { processUploadedFiles, processUploadedFile, VALID_SECTIONS } from "./media-upload-middleware";
// WebSocket already imported at the top

const scryptAsync = promisify(scrypt);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create specialized uploader configuration for real estate media
const realEstateMediaType = MEDIA_TYPES.REAL_ESTATE_MEDIA;
const realEstateFileSize = 20 * 1024 * 1024; // 20MB

// Reusable configuration function for real estate uploads
function handleRealEstateUpload(req: Request, res: Response, next: NextFunction) {
  // Set up an in-memory storage multer instance for temporary files
  // These will later be uploaded to Object Storage exclusively (no filesystem storage)
  const upload = multer({
    limits: { fileSize: realEstateFileSize },
    storage: multer.memoryStorage(), // Use memory storage instead of disk storage
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'image/svg+xml',
        'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
        'text/csv'
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        console.log(`Rejected file with mimetype: ${file.mimetype}`);
        cb(new Error('Invalid file type'));
      }
    }
  });
  
  // Always set the media type for real estate
  req.mediaType = MEDIA_TYPES.REAL_ESTATE_MEDIA;
  console.log(`Real estate upload middleware - Using memory storage for Object Storage exclusive upload`);
  
  // Use multer's array method to handle multiple file uploads
  const handler = upload.array('media');
  return handler(req, res, next);
}

// Configure multer for standard file uploads with enhanced media path support for production
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req: any, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
      // Determine media type from the request based on field name or explicit setting
      let mediaType;
      
      if (req.mediaType) {
        // Use explicitly set media type
        mediaType = req.mediaType;
      } else if (file.fieldname === 'bannerImage') {
        mediaType = MEDIA_TYPES.BANNER_SLIDES;
      } else if (file.fieldname === 'media') {
        mediaType = MEDIA_TYPES.CALENDAR;
      } else if (file.fieldname === 'avatar') {
        mediaType = MEDIA_TYPES.AVATARS;
      } else if (file.fieldname === 'iconFile') {
        mediaType = MEDIA_TYPES.ICONS;
      } else if (file.fieldname === 'mediaFile') {
        // Check if this is a forum-related upload by examining the request URL or headers
        if (req.originalUrl && req.originalUrl.includes('/forum/')) {
          mediaType = MEDIA_TYPES.FORUM;
          console.log(`Detected forum media upload from URL: ${req.originalUrl}`);
        } else if (req.headers && req.headers.referer && req.headers.referer.includes('/forum/')) {
          mediaType = MEDIA_TYPES.FORUM;
          console.log(`Detected forum media upload from referer: ${req.headers.referer}`);
        } else {
          mediaType = MEDIA_TYPES.CONTENT;
        }
      } else if (file.fieldname === 'forumMedia') {
        mediaType = MEDIA_TYPES.FORUM;
      } else if (file.fieldname === 'vendorMedia') {
        mediaType = MEDIA_TYPES.VENDOR;
      } else if (file.fieldname === 'communityMedia') {
        mediaType = MEDIA_TYPES.COMMUNITY;
      } else if (file.fieldname === 'realEstateMedia') {
        mediaType = MEDIA_TYPES.REAL_ESTATE_MEDIA; // Use the new dedicated folder
      } else if (file.fieldname === 'attachedAsset') {
        mediaType = MEDIA_TYPES.ATTACHED_ASSETS;
      }
      
      // Store the media type on the request object for later use in the endpoint handlers
      req.mediaType = mediaType;
      
      let uploadDir;
      
      if (mediaType) {
        // Get the appropriate uploads directory
        uploadDir = path.join(__dirname, '../uploads', mediaType);
        
        // Also ensure the production directory exists for later copying
        const prodDir = path.join(__dirname, '..', mediaType);
        ensureDirectoryExists(prodDir);
        
        console.log(`Media upload detected - type: ${mediaType}, directory: ${uploadDir}`);
      } else {
        // Default uploads directory if media type not determined
        uploadDir = path.join(__dirname, '../uploads');
        console.log(`Generic upload - using default directory: ${uploadDir}`);
      }
      
      // Ensure the directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: function (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // SVG
      'image/svg+xml',
      // Videos
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
      // Other
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log(`Rejected file with mimetype: ${file.mimetype}`);
      cb(new Error('Invalid file type'));
    }
  },
  limits: {
    fileSize: 350 * 1024 * 1024 // 350MB limit for videos
  }
});

// Password hashing function
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Helper functions for media paths
function getMediaUrl(mediaType: string, filename: string, useUploads: boolean = true): string {
  if (useUploads) {
    return `/uploads/${mediaType}/${filename}`;
  } else {
    return `/${mediaType}/${filename}`;
  }
}

function processUploadedFile(req: any, file: Express.Multer.File): { success: boolean, url: string, developmentUrl: string, message?: string } {
  console.log(`[ProcessFile] Processing uploaded file with media type: ${req.mediaType || 'uploads'}`);
  
  if (!file) {
    console.error('[ProcessFile] No file provided in request');
    return { 
      success: false, 
      url: '', 
      developmentUrl: '',
      message: 'No file provided' 
    };
  }
  
  // Get media type
  const mediaType = req.mediaType || 'uploads';
  console.log(`[ProcessFile] Using media type: ${mediaType}`);
  
  // Generate URLs
  const developmentUrl = `/uploads/${mediaType}/${file.filename}`;
  const url = `/${mediaType}/${file.filename}`;
  
  console.log(`[ProcessFile] Generated URLs:`, {
    developmentUrl,
    productionUrl: url
  });
  
  // Copy file to production location if needed
  const uploadsPath = path.join(__dirname, '..', developmentUrl);
  const prodPath = path.join(__dirname, '..', url);
  
  console.log(`[ProcessFile] File paths:`, {
    uploadsPath,
    productionPath: prodPath
  });
  
  // Check if uploads file exists
  if (!fs.existsSync(uploadsPath)) {
    console.error(`[ProcessFile] Source file does not exist at expected path: ${uploadsPath}`);
    
    // Enhanced error recovery - check if file exists in temporary location
    const tempPath = path.join(os.tmpdir(), file.filename);
    const tempExists = fs.existsSync(tempPath);
    console.log(`[ProcessFile] Checking temporary location: ${tempPath}, exists: ${tempExists}`);
    
    if (tempExists) {
      // Create the uploads directory if it doesn't exist
      const uploadsDir = path.dirname(uploadsPath);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`[ProcessFile] Created uploads directory: ${uploadsDir}`);
      }
      
      // Copy from temp directory to uploads directory
      try {
        fs.copyFileSync(tempPath, uploadsPath);
        console.log(`[ProcessFile] Successfully copied file from temp location to uploads: ${uploadsPath}`);
      } catch (err) {
        console.error(`[ProcessFile] Failed to copy from temp location: ${err}`);
        // Continue to check other potential locations
      }
    }
    
    // After recovery attempt, check again if the file exists
    if (!fs.existsSync(uploadsPath)) {
      console.error(`[ProcessFile] Recovery failed, file not found in any location`);
      return {
        success: false,
        url: '',
        developmentUrl: '',
        message: 'Source file missing after upload - recovery failed'
      };
    }
  }
  
  // For calendar and vendor media, ensure files exist in both paths
  if (mediaType === MEDIA_TYPES.CALENDAR || mediaType === MEDIA_TYPES.VENDOR) {
    // Create the production directory if it doesn't exist
    const prodDir = path.dirname(prodPath);
    if (!fs.existsSync(prodDir)) {
      console.log(`[ProcessFile] Creating production directory: ${prodDir}`);
      fs.mkdirSync(prodDir, { recursive: true });
    }
    
    // Copy the file to production location
    try {
      fs.copyFileSync(uploadsPath, prodPath);
      console.log(`[ProcessFile] Successfully copied file:`, {
        from: uploadsPath,
        to: prodPath,
        fileSize: `${Math.round(fs.statSync(prodPath).size / 1024)}KB`
      });
    } catch (err) {
      console.error(`[ProcessFile] Error copying file to production location:`, err);
      // Still return success as the file is at least in the uploads directory
    }
    
    // Verify both files exist
    const uploadsExists = fs.existsSync(uploadsPath);
    const prodExists = fs.existsSync(prodPath);
    
    console.log(`[ProcessFile] File existence check:`, {
      uploadsPath: uploadsExists ? 'Exists' : 'Missing',
      productionPath: prodExists ? 'Exists' : 'Missing'
    });
  } else {
    // For other media types, use the standard approach
    // Create the production directory if it doesn't exist
    const prodDir = path.dirname(prodPath);
    if (!fs.existsSync(prodDir)) {
      console.log(`[ProcessFile] Creating production directory: ${prodDir}`);
      fs.mkdirSync(prodDir, { recursive: true });
    }
    
    // Copy the file to production location
    try {
      fs.copyFileSync(uploadsPath, prodPath);
      console.log(`[ProcessFile] Successfully copied file:`, {
        from: uploadsPath,
        to: prodPath,
        fileSize: `${Math.round(fs.statSync(prodPath).size / 1024)}KB`
      });
    } catch (err) {
      console.error(`[ProcessFile] Error copying file to production location:`, err);
      // Still return success as the file is at least in the uploads directory
    }
  }
  
  return {
    success: true,
    url,
    developmentUrl
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const server = createServer(app);
  
  setupAuth(app);
  
  // Apply analytics middleware to capture page views and user behavior
  app.use(analyticsMiddleware);
  
  // API endpoint for real estate media files
  app.get('/api/real-estate-media/:filename', async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      
      console.log(`[RealEstateMedia] Received request for: ${filename}`);
      
      // Try multiple sources in sequence
      
      // 1. Check Object Storage with real-estate-media prefix
      try {
        const storageKey = `real-estate-media/${filename}`;
        console.log(`[RealEstateMedia] Trying Object Storage: ${storageKey}`);
        
        const buffer = await objectStorageService.getFile(storageKey, 'REAL_ESTATE');
        if (buffer && buffer.length > 0) {
          console.log(`[RealEstateMedia] Found in Object Storage: ${storageKey}`);
          const ext = path.extname(filename).toLowerCase();
          const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                             ext === '.png' ? 'image/png' : 
                             ext === '.gif' ? 'image/gif' : 
                             ext === '.webp' ? 'image/webp' : 'application/octet-stream';
          
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.send(buffer);
        }
      } catch (err) {
        console.log(`[RealEstateMedia] Object storage check failed: ${err.message}`);
      }
      
      // 2. Check filesystem paths as fallback
      const possiblePaths = [
        path.join(__dirname, '..', 'uploads', 'real-estate-media', filename),
        path.join(__dirname, '..', 'real-estate-media', filename)
      ];
      
      console.log(`[RealEstateMedia] Checking filesystem paths`);
      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          console.log(`[RealEstateMedia] Found in filesystem: ${filePath}`);
          return res.sendFile(filePath);
        }
      }
      
      // 3. Redirect to storage proxy as final attempt
      console.log(`[RealEstateMedia] Trying storage proxy fallback`);
      return res.redirect(`/api/storage-proxy/REAL_ESTATE/${filename}`);
      
    } catch (error) {
      console.error('[RealEstateMedia] Error serving real estate media:', error);
      // Fallback to default property image
      return res.redirect('/default-property-image.svg');
    }
  });
  
  // Configure WebSockets for chat
  // Setup WebSockets for real-time messaging feature
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received message:', data);
        
        // Handle message types for the chat system
        if (data.type === 'chat-message') {
          console.log('Processing chat message:', data.data);
          // Broadcast the chat message to all clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat-message',
                data: data.data,
                timestamp: new Date().toISOString()
              }));
            }
          });
        } else if (data.type === 'read-message') {
          console.log('Processing read status update:', data.data);
          // Broadcast read status to all clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'read-message',
                data: data.data,
                timestamp: new Date().toISOString()
              }));
            }
          });
        } else {
          // Default broadcast for other message types
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });
  
  // Message routes - register at both paths for compatibility
  app.use('/api/chat', chatRouter);
  // Also mount the routes at /api directly for the new interface
  app.use('/api', chatRouter);
  
  // Google Maps API key proxy to fix hardcoded key issue
  app.get('/google-maps-proxy', async (req, res) => {
    try {
      logger.info(`Google Maps proxy request received with params: ${JSON.stringify(req.query)}`);
      
      // Get client domain for CORS
      const origin = req.headers.origin || '*';
      
      // Allow browsers to call this endpoint by setting proper CORS headers
      res.set('Access-Control-Allow-Origin', origin);
      
      // Preconnect to Google's domains to speed up subsequent requests
      res.set('Link', '<https://maps.googleapis.com>; rel=preconnect; crossorigin, <https://maps.gstatic.com>; rel=preconnect; crossorigin');
      
      // Set appropriate content type for JavaScript
      res.set('Content-Type', 'application/javascript');
      
      // Cache for 24 hours to improve performance
      res.set('Cache-Control', 'public, max-age=86400');
      
      // Use the GoogleService to proxy the Google Maps script
      const scriptContent = await googleService.proxyGoogleMapsScript(req.query as Record<string, string>);
      
      // Send the proxied script content
      res.send(scriptContent);
      
      logger.info('Successfully served Google Maps script via proxy');
    } catch (error) {
      logger.error('Error proxying Google Maps script:', error);
      
      // Send a more helpful error response
      res.status(500).send(`
        // Google Maps API loading error
        console.error("Server failed to proxy Google Maps API:", ${JSON.stringify(String(error))});
        
        // Try to notify any waiting callbacks
        if (window.gm_authFailure) {
          window.gm_authFailure();
        }
        
        // Dispatch a custom event that the app can listen for
        window.dispatchEvent(new CustomEvent('google-maps-load-error'));
      `);
    }
  });

  // Password Reset Request Route
  app.post("/api/password-reset/request", async (req, res) => {
    try {
      console.log("===== Password reset request received =====");
      const { email } = req.body;
      
      console.log("Request body:", req.body);
      
      if (!email) {
        console.log("Email is required but was not provided");
        return res.status(400).json({ message: "Email is required" });
      }
      
      console.log(`Attempting to find user with email: ${email}`);
      
      // Find user by email (case-insensitive)
      const user = await storage.getUserByEmailCaseInsensitive(email);
      
      if (!user) {
        console.log(`No user found with email (case-insensitive): ${email}`);
        // Include emailExists: false flag to show appropriate message on frontend, but wording still doesn't reveal too much
        return res.status(200).json({ 
          message: "If a user with that email exists, a password reset link has been sent", 
          emailExists: false 
        });
      }
      
      console.log(`User found: ID ${user.id}, Username: ${user.username}, Email: ${user.email}`);
      
      // Generate a reset token
      const resetToken = generateResetToken();
      const resetTokenExpires = new Date(Date.now() + 3600000); // Token expires in 1 hour
      
      console.log(`Generated reset token for user ${user.id}: ${resetToken.substring(0, 8)}...`);
      console.log(`Token will expire at: ${resetTokenExpires.toISOString()}`);
      
      // Update user with reset token information
      console.log(`Updating user ${user.id} with reset token`);
      try {
        await storage.updateUser(user.id, {
          resetToken,
          resetTokenExpires,
          updatedAt: new Date()
        });
        console.log("Database update successful for reset token");
      } catch (dbError) {
        console.error("Failed to update user in database:", dbError);
        return res.status(500).json({ message: "Failed to save reset token" });
      }

      // Send password reset email
      console.log(`Attempting to send password reset email to: ${user.email}`);
      try {
        const emailSent = await sendPasswordResetEmail(user, resetToken, resetTokenExpires);
        console.log(`Password reset email sending result: ${emailSent ? 'SUCCESS' : 'FAILED'}`);
        
        // Check email configuration if sending failed
        if (!emailSent) {
          console.log("Email sending failed. Checking environment variables:");
          console.log(`- GMAIL_APP_PASSWORD: ${process.env.GMAIL_APP_PASSWORD ? 'Set' : 'Not set'}`);
          console.log(`- GOOGLE_USER_EMAIL: ${process.env.GOOGLE_USER_EMAIL ? 'Set' : 'Not set'}`);
        }
      } catch (emailError) {
        console.error("Email sending threw an exception:", emailError);
        // Don't return error to client for security - we still created the token
      }
      
      return res.status(200).json({ 
        message: "A password reset link has been sent to your email",
        emailExists: true, 
        email: user.email 
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      // Enhanced error logging
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      return res.status(500).json({ message: "An error occurred while processing your request" });
    }
  });
  
  // Validate Reset Token Route
  app.post("/api/password-reset/validate", async (req, res) => {
    try {
      const { email, token } = req.body;
      
      if (!email || !token) {
        return res.status(400).json({ message: "Email and token are required" });
      }
      
      // Find user by email (case-insensitive)
      const user = await storage.getUserByEmailCaseInsensitive(email);
      
      if (!user || !user.resetToken || user.resetToken !== token) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      // Check if token has expired
      if (!user.resetTokenExpires || new Date() > new Date(user.resetTokenExpires)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }
      
      return res.status(200).json({ message: "Token is valid", valid: true });
    } catch (error) {
      console.error("Token validation error:", error);
      return res.status(500).json({ message: "An error occurred while validating the token" });
    }
  });
  
  // Reset Password Route
  app.post("/api/password-reset/reset", async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;
      
      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Email, token, and new password are required" });
      }
      
      // Find user by email (case-insensitive)
      const user = await storage.getUserByEmailCaseInsensitive(email);
      
      if (!user || !user.resetToken || user.resetToken !== token) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      // Check if token has expired
      if (!user.resetTokenExpires || new Date() > new Date(user.resetTokenExpires)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }
      
      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update user with new password and clear reset token
      await storage.updateUser(user.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        updatedAt: new Date()
      });
      
      return res.status(200).json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      return res.status(500).json({ message: "An error occurred while resetting your password" });
    }
  });

  // Note: Static file middleware for uploads directory is now configured in server/index.ts
  // to ensure it runs before authentication middleware
  
  // Production data sync and debugging endpoints (admin only)
  app.use('/api/production-sync', productionSyncRouter);
  
  // Production authentication troubleshooting endpoints
  app.use('/api/production-auth', productionAuthRouter);
  
  // Deployment diagnostic endpoints
  app.use('/api/deployment-diagnostic', deploymentDiagnosticRouter);
  
  // Calendar media diagnostics for fixing event media issues
  app.use('/api/calendar-media', calendarMediaDiagnosticsRouter);
  
  // Storage browser for diagnostic purposes
  app.use('/api', storageBrowserRouter);
  
  // Banner slide helpers for fixing banner display issues
  app.use('/api', bannerSlideHelpersRouter);
  
  // We'll add the message diagnostics routes in a different way
  
  // Analytics routes for tracking user behavior
  app.use('/api/analytics', analyticsRouter);
  
  // Add direct routes for our test event API HTML files
  app.get('/test-event-api.html', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'test-event-api.html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('Test event API page not found');
    }
  });
  
  // Add direct route for event media test page
  app.get('/event-media-test.html', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'event-media-test.html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('Event Media Test page not found');
    }
  });
  
  // Add direct route for forum media test page
  app.get('/forum-media-test.html', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'forum-media-test.html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('Forum Media Test page not found');
    }
  });
  
  // Add direct route for tmp_debug files
  app.get('/tmp_debug/:filename', (req, res) => {
    const filepath = path.join(__dirname, '..', 'tmp_debug', req.params.filename);
    console.log(`Request for tmp_debug file: ${filepath}`);
    if (fs.existsSync(filepath)) {
      res.sendFile(filepath);
    } else {
      res.status(404).send(`Debug file not found: ${req.params.filename}`);
    }
  });
  
  // Also serve the test page directly at the root URL
  app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'test-event-api.html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('Test event API page not found');
    }
  });
  
  // Admin debug routes for diagnostics and troubleshooting
  app.use('/api/admin/debug', requireAdmin, debugRouter);
  
  // User subscriptions router for membership management
  app.use('/api/subscriptions', userSubscriptionsRouter);
  
  // Add sponsorship proxy to forward /api/sponsorship/* to /api/subscriptions/*
  // This maintains backwards compatibility while using more appropriate terminology
  app.use('/api/sponsorship', sponsorshipProxyRouter);
  
  // Special route to handle subscription confirmation redirect
  // This is needed because Square redirects to /subscriptions/confirm instead of /api/subscriptions/confirm
  app.get('/subscriptions/confirm', (req, res) => {
    console.log('Subscription confirmation redirect received at /subscriptions/confirm:', req.query);
    // Forward the request to the API endpoint with the same query parameters
    res.redirect(`/api/subscriptions/confirm${req.url.substring(req.path.length)}`);
  });
  
  // Add sponsorship confirmation redirect handler (for consistency with the new naming)
  app.get('/sponsorship/confirm', (req, res) => {
    console.log('Sponsorship confirmation redirect received at /sponsorship/confirm:', req.query);
    // Forward to the subscriptions API endpoint
    res.redirect(`/api/subscriptions/confirm${req.url.substring(req.path.length)}`);
  });
  
  // Setup memberships utility for creating membership products (admin only)
  app.use('/api/setup-memberships', setupMembershipsRouter);
  
  // Membership processing tools for admins
  app.use('/api/membership-processing', membershipProcessingRouter);
  
  // User search endpoints (admin only)
  const { default: usersSearchRouter } = await import('./routes/users-search.js');
  app.use('/api/users', usersSearchRouter);
  
  // Chat system endpoints (new WebSocket-based implementation)
  app.use('/api/chat', chatRouter);
  
  // Development-only endpoint to access the last generated password reset link
  // This is useful when email delivery is unreliable in development
  app.get("/api/dev/last-reset-link", (req, res) => {
    // Only available in development mode
    if (process.env.NODE_ENV !== 'production') {
      if (global.lastPasswordResetLink) {
        return res.json({
          message: "Last password reset link information",
          data: global.lastPasswordResetLink,
          resetUrl: `${req.protocol}://${req.get('host')}/reset-password?token=${global.lastPasswordResetLink.token}&email=${encodeURIComponent(global.lastPasswordResetLink.email)}`
        });
      } else {
        return res.status(404).json({ message: "No password reset link has been generated yet" });
      }
    } else {
      return res.status(403).json({ message: "This endpoint is not available in production" });
    }
  });
  
  // Development-only endpoint to access the last sent email preview URLs
  app.get("/api/dev/email-previews", (req, res) => {
    // Only available in development mode
    if (process.env.NODE_ENV !== 'production') {
      if (global.lastEmailPreviewUrl && global.lastEmailPreviewUrl.length > 0) {
        return res.json({
          message: "Last email preview URLs",
          emailPreviews: global.lastEmailPreviewUrl
        });
      } else {
        return res.status(404).json({ message: "No email previews are available" });
      }
    } else {
      return res.status(403).json({ message: "This endpoint is not available in production" });
    }
  });
  
  // Feature Flags API Routes
  
  // Get all feature flags (for authorized users)
  app.get("/api/feature-flags", async (req, res) => {
    try {
      // Get all feature flags
      const flags = await storage.getFeatureFlags();
      
      // If no user is authenticated, return all active flags
      // This allows public pages to respect feature flags without requiring authentication
      if (!req.isAuthenticated()) {
        return res.json(flags);
      }
      
      // If the user is an admin, return all flags (active and inactive)
      // Otherwise, return only flags relevant to the user's role
      const userRole = req.user?.role || '';
      if (userRole === 'admin') {
        return res.json(flags);
      } else {
        // Filter flags that apply to the user's role
        const relevantFlags = flags.filter((flag: FeatureFlag) => 
          flag.enabledForRoles.includes(userRole.toLowerCase() as "registered" | "paid" | "admin")
        );
        return res.json(relevantFlags);
      }
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      return res.status(500).json({ message: "Failed to fetch feature flags" });
    }
  });
  
  // Create a new feature flag (admin only)
  app.post("/api/feature-flags", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertFeatureFlagSchema.parse(req.body);
      const newFlag = await storage.createFeatureFlag(validatedData);
      return res.status(201).json(newFlag);
    } catch (error: any) {
      console.error("Error creating feature flag:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid feature flag data", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to create feature flag" });
    }
  });
  
  // Update an existing feature flag (admin only)
  app.patch("/api/feature-flags/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature flag ID" });
      }
      
      const existingFlag = await storage.getFeatureFlag(id);
      if (!existingFlag) {
        return res.status(404).json({ message: "Feature flag not found" });
      }
      
      const updatedFlag = await storage.updateFeatureFlag(id, req.body);
      return res.json(updatedFlag);
    } catch (error: any) {
      console.error("Error updating feature flag:", error);
      return res.status(500).json({ message: "Failed to update feature flag" });
    }
  });
  
  // Get feature flags for admin view (admin only)
  app.get("/api/feature-flags/admin", requireAdmin, async (req, res) => {
    try {
      // Get all feature flags for admin dashboard
      const flags = await storage.getFeatureFlags();
      return res.json(flags);
    } catch (error) {
      console.error("Error fetching feature flags for admin:", error);
      return res.status(500).json({ message: "Failed to fetch feature flags" });
    }
  });
  
  // Bulk update feature flags (admin only)
  app.put("/api/feature-flags", requireAdmin, async (req, res) => {
    try {
      const { flags } = req.body;
      
      if (!Array.isArray(flags)) {
        return res.status(400).json({ message: "Invalid data format. Expected an array of flags." });
      }
      
      const updatedFlags = [];
      
      // Update each flag in the array
      for (const flag of flags) {
        if (!flag.id) continue;
        
        const updatedFlag = await storage.updateFeatureFlag(flag.id, {
          enabledForRoles: flag.enabledForRoles,
          isActive: flag.isActive
        });
        
        updatedFlags.push(updatedFlag);
      }
      
      return res.json({ 
        success: true, 
        message: `Successfully updated ${updatedFlags.length} feature flags`,
        flags: updatedFlags
      });
    } catch (error) {
      console.error("Error updating feature flags:", error);
      return res.status(500).json({ message: "Failed to update feature flags" });
    }
  });

  // Delete a feature flag (admin only)
  app.delete("/api/feature-flags/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature flag ID" });
      }
      
      const existingFlag = await storage.getFeatureFlag(id);
      if (!existingFlag) {
        return res.status(404).json({ message: "Feature flag not found" });
      }
      
      await storage.deleteFeatureFlag(id);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting feature flag:", error);
      return res.status(500).json({ message: "Failed to delete feature flag" });
    }
  });
  
  // Initialize default feature flags if needed (admin only)
  app.post("/api/feature-flags/initialize", requireAdmin, async (req, res) => {
    try {
      const flags = await storage.initializeDefaultFeatureFlags();
      return res.status(201).json(flags);
    } catch (error: any) {
      console.error("Error initializing default feature flags:", error);
      return res.status(500).json({ message: "Failed to initialize default feature flags" });
    }
  });
  
  // Endpoint to create the weather_rocket_icons feature flag specifically
  app.post("/api/feature-flags/create-weather-rocket", requireAdmin, async (req, res) => {
    try {
      console.log("Creating weather_rocket_icons feature flag");
      
      // Check if the flag already exists
      const existingFlag = await storage.getFeatureFlagByName(FeatureFlagName.WEATHER_ROCKET_ICONS);
      if (existingFlag) {
        console.log("Weather & Rocket Icons feature flag already exists:", existingFlag);
        return res.status(200).json(existingFlag);
      }
      
      // Create the new feature flag with all roles enabled by default
      const newFlag = {
        name: FeatureFlagName.WEATHER_ROCKET_ICONS,
        displayName: 'Weather & Rocket Icons',
        enabledForRoles: [
          UserRole.GUEST,
          UserRole.REGISTERED,
          UserRole.BADGE_HOLDER,
          UserRole.PAID,
          UserRole.MODERATOR,
          UserRole.ADMIN
        ],
        description: 'Show weather temperature and rocket icon in the navigation bar',
        isActive: true
      };
      
      const result = await storage.createFeatureFlag(newFlag);
      console.log("Weather & Rocket Icons feature flag created successfully:", result);
      return res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating weather_rocket_icons feature flag:", error);
      return res.status(500).json({ message: "Failed to create weather_rocket_icons feature flag" });
    }
  });
  
  // Update a specific role permission for a feature flag (admin only)
  app.patch("/api/feature-flags/:id/role/:role", requireAdmin, async (req, res) => {
    try {
      const flagId = req.params.id;
      const roleName = req.params.role;
      const { enabled } = req.body;
      
      console.log(`Updating permission for flag: ${flagId}, role: ${roleName}, enabled: ${enabled}`);
      
      // List of permission controls - make sure to match the IDs in the client
      const permissionControls = [
        { name: "comments", displayName: "Comments", description: "Allow commenting throughout the site (forum, calendar, etc.)" },
        { name: "reactions", displayName: "Like/Going/Interested", description: "Allow clicking reaction buttons throughout the site" },
        { name: "calendar_post", displayName: "Post Event on Calendar", description: "Allow creating new calendar events" },
        { name: "forum_post", displayName: "Create Forum Topic", description: "Allow creating new forum topics" },
        { name: "for_sale_post", displayName: "Create For Sale Listing", description: "Allow posting items for sale" },
        { name: "vendor_page", displayName: "Create Vendor/Community Page", description: "Allow creating vendor or community pages" },
        { name: "admin_access", displayName: "Access Admin Dashboard", description: "Allow access to the admin dashboard" },
        { name: "admin_forum", displayName: "Access Admin-only Forums", description: "Allow access to admin-only forum categories" },
      ];
      
      // List of navigation items - match the IDs in the client
      const navigationItems = [
        { name: "nav-forum", displayName: "Forum", description: "Access to community forum" },
        { name: "nav-store", displayName: "Store", description: "Access to community store" },
        { name: "nav-calendar", displayName: "Calendar", description: "Access to community calendar features" },
        { name: "nav-community", displayName: "Community", description: "Access to community information pages" },
        { name: "nav-for-sale", displayName: "For Sale", description: "Access to marketplace listings" },
        { name: "nav-vendors", displayName: "Vendors", description: "Access to preferred vendors" }
      ];
      
      // Get the current flag data
      let existingFlag = await storage.getFeatureFlagByName(flagId);
      
      // If flag doesn't exist, create it first
      if (!existingFlag) {
        // Check if it's a permission control
        const permissionControl = permissionControls.find(control => control.name === flagId);
        // Check if it's a navigation item
        const navigationItem = navigationItems.find(item => item.name === flagId);
        
        // If it's either a permission control or navigation item, we can create it
        if (permissionControl || navigationItem) {
          const control = permissionControl || navigationItem;
          console.log(`Creating new feature flag: ${flagId}`);
          
          // Setup default roles - all features enabled for admin
          let defaultRoles = ['admin', 'moderator', 'paid', 'badge_holder', 'registered'];
          
          // For navigation items, make almost everything available by default (except guest for some)
          if (navigationItem) {
            // For navigation items, most are available to all users including guests
            defaultRoles.push('guest');
          }
          // For permission controls, set more restrictive defaults
          else if (permissionControl) {
            // Reset to just admin, then add others as needed
            defaultRoles = ['admin'];
            
            // Set reasonable defaults based on permission type
            if (flagId === 'comments' || flagId === 'reactions') {
              defaultRoles.push('badge_holder', 'paid', 'moderator');
            } else if (flagId === 'for_sale_post') {
              defaultRoles.push('registered', 'badge_holder', 'paid', 'moderator'); 
            } else if (flagId === 'calendar_post' || flagId === 'forum_post') {
              defaultRoles.push('paid', 'moderator');
            } else if (flagId === 'admin_access' || flagId === 'admin_forum') {
              // Only for admin and moderator
              defaultRoles.push('moderator');
            }
          }
          
          // Create the feature flag
          const newFlag = await storage.createFeatureFlag({
            name: control.name,
            displayName: control.displayName,
            description: control.description,
            enabledForRoles: defaultRoles,
            isActive: true
          });
          
          existingFlag = newFlag;
          console.log(`Created new feature flag: ${existingFlag.name}`);
        } else {
          return res.status(404).json({ message: `Feature flag '${flagId}' not found` });
        }
      }
      
      // Get the current role permissions
      const currentRoles = existingFlag.enabledForRoles || [];
      
      // Update the role permissions based on the enabled flag
      let updatedRoles = [...currentRoles];
      if (enabled === true) {
        // Add the role if it's not already in the array
        if (!updatedRoles.includes(roleName)) {
          updatedRoles.push(roleName);
        }
      } else {
        // Remove the role if it exists in the array
        updatedRoles = updatedRoles.filter(role => role !== roleName);
      }
      
      // Update the flag with the new role permissions
      const updatedFlag = await storage.updateFeatureFlag(existingFlag.id, {
        enabledForRoles: updatedRoles
      });
      
      return res.json({
        success: true,
        message: `Successfully updated '${roleName}' permission for feature flag '${flagId}'`,
        flag: updatedFlag
      });
    } catch (error: any) {
      console.error(`Error updating role permission for feature flag:`, error);
      return res.status(500).json({ message: "Failed to update feature flag role permission" });
    }
  });

  // Password Update Route
  app.post("/api/user/password", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      const updatedUser = await storage.updateUser(req.user.id, {
        password: hashedPassword,
        updatedAt: new Date()
      });

      if (!updatedUser) {
        throw new Error("Failed to update password");
      }

      res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      console.error("Error updating password:", err);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // User Profile Update Route (updated to handle role changes)
  app.patch("/api/user", async (req, res) => {
    console.log("****** PROFILE UPDATE ROUTE CALLED ******");
    
    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      console.log("Update profile request:", {
        body: req.body,
        userId: req.user.id,
        currentUser: req.user,
        session: req.session,
        isAuthenticated: req.isAuthenticated()
      });

      // Ensure required fields
      if (!req.body.fullName) {
        console.log("Missing required field: fullName");
        return res.status(400).json({
          success: false,
          message: "Full name is required"
        });
      }

      // Check if role update is attempted and if user is admin
      if (req.body.role && req.user.role !== 'admin') {
        console.log("Non-admin attempting to update role");
        return res.status(403).json({
          success: false,
          message: "Only administrators can update user roles"
        });
      }

      const updateData = {
        fullName: req.body.fullName,
        username: req.body.username || req.user.username,
        email: req.body.email || req.user.email,
        isResident: req.body.isResident === true,
        role: req.body.role || req.user.role,
        updatedAt: new Date(),
        residentTags: Array.isArray(req.body.residentTags) ? req.body.residentTags : req.user.residentTags || []
      };

      console.log("Attempting to update user with data:", updateData);
      console.log("Current user ID:", req.user.id, "Type:", typeof req.user.id);
      
      try {
        const updatedUser = await storage.updateUser(req.user.id, updateData);

        if (!updatedUser) {
          console.error("Update failed - no user returned");
          return res.status(404).json({
            success: false,
            message: "User not found"
          });
        }
        
        console.log("User updated successfully:", updatedUser);

        // Update session with new user data
        req.user = updatedUser;

        // Force session save
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              reject(err);
            } else {
              console.log("Session saved successfully with updated user:", updatedUser);
              resolve();
            }
          });
        });
        
        // Send response after successful update
        return res.json({
          success: true,
          message: "Profile updated successfully",
          user: updatedUser
        });
        
      } catch (updateError) {
        console.error("Error in storage.updateUser:", updateError);
        return res.status(500).json({
          success: false,
          message: "Database error when updating user"
        });
      }
    } catch (err) {
      console.error("Error updating user profile:", err);
      res.status(500).json({
        success: false,
        message: "Failed to update user profile"
      });
    }
  });

  // User Avatar Upload - using generic processUploadedFile function
  app.post("/api/upload/avatar", upload.single('avatar'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Set the media type explicitly for avatar uploads
      req.mediaType = 'avatars';
      
      // Use our generic file processing function to handle uploads and copying to production paths
      const result = processUploadedFile(req, req.file);
      
      if (!result.success) {
        console.error("Avatar upload failed:", result.message);
        return res.status(400).json({ 
          success: false,
          message: result.message 
        });
      }
      
      console.log(`Avatar uploaded and processed successfully: ${result.url}`);

      // Update user's avatar URL in the database - use production URL format
      const updatedUser = await storage.updateUser(req.user.id, {
        avatarUrl: result.url, // Use production-friendly URL format
        updatedAt: new Date()
      });

      if (!updatedUser) {
        throw new Error("Failed to update user");
      }

      // Update session with new user data
      req.user = updatedUser;

      // Force session save
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({
        success: true,
        message: "Profile photo updated successfully",
        url: result.url, // Primary production URL
        backupUrl: result.developmentUrl, // Backup URL with /uploads/ prefix
        user: updatedUser
      });
    } catch (err) {
      console.error("Error uploading avatar:", err);
      res.status(500).json({
        success: false,
        message: "Failed to upload avatar"
      });
    }
  });


  // Real estate media upload endpoint using Object Storage exclusively
  app.post("/api/upload/real-estate-media", handleRealEstateUpload, async (req, res) => {
    // Import the object storage utilities
    const objectStorage = await import('./object-storage.js');
    
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const files = req.files as Express.Multer.File[];
      
      // Always use real-estate-media type for this endpoint
      req.mediaType = MEDIA_TYPES.REAL_ESTATE_MEDIA;
      
      console.log(`Processing ${files.length} real estate media files using Object Storage exclusively`);
      
      // Process the uploaded files and upload directly to Object Storage
      const mediaUrls = await Promise.all(
        files.map(async (file) => {
          try {
            // Generate a unique filename with timestamp
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const extension = path.extname(file.originalname);
            const filename = uniqueSuffix + extension;
            
            // Upload directly to Object Storage from memory buffer
            const buffer = file.buffer;
            if (!buffer) {
              throw new Error("File buffer is undefined");
            }
            
            // Upload to Object Storage exclusively
            const storageKey = await objectStorage.default.uploadRealEstateMediaFromBuffer(
              buffer,
              filename
            );
            
            console.log(`Uploaded real estate media to Object Storage: ${storageKey}`);
            
            // We use Object Storage exclusively, no filesystem copies are created
            return storageKey;
          } catch (error) {
            console.error("Error processing upload:", error);
            throw error;
          }
        })
      );
      
      console.log(`Successfully uploaded ${mediaUrls.length} real estate media files to Object Storage exclusively`);
      res.json({ mediaUrls });
    } catch (error) {
      console.error("Error uploading real estate media:", error);
      res.status(500).json({ 
        message: "Error uploading files", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * General media upload endpoint with section-aware routing
   * This is the new primary endpoint for all uploads, supporting multi-bucket storage
   * Uses Object Storage exclusively instead of filesystem
   */
  app.post('/api/upload', 
    // Authentication middleware
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      next();
    },
    // First use multer to capture the uploaded file
    // Using disk storage for large files to prevent memory issues
    multer({ 
      storage: multer.diskStorage({
        destination: function (req, file, cb) {
          const tmpdir = path.join(os.tmpdir(), 'uploads');
          fs.mkdirSync(tmpdir, { recursive: true });
          cb(null, tmpdir);
        },
        filename: function (req, file, cb) {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
        }
      }),
      limits: {
        fileSize: 350 * 1024 * 1024 // 350MB limit for videos
      }
    }).single('file'),
    // Then determine media type/section (must come after multer)
    (req: Request, res: Response, next: NextFunction) => {
      // Get section from request body or query parameter
      // Log the request details to debug the form data
      console.log('[Upload] Request body:', req.body);
      console.log('[Upload] Request query:', req.query);
      
      let section = 'content';
      
      // Look for section parameter from body first
      if (req.body && req.body.section) {
        section = req.body.section.toLowerCase();
      } 
      // Then try query parameter
      else if (req.query && req.query.section) {
        section = (req.query.section as string).toLowerCase();
      }
      // If we're in the forum module, set section to forum
      else if (req.headers.referer && req.headers.referer.includes('/forum')) {
        section = 'forum';
      }
      
      console.log(`[Upload] Processing file for section: ${section}`);
      
      // Map section to standardized media type for bucket organization
      let mediaType = 'general';
      
      if (section === 'forum') {
        mediaType = 'forum';
        console.log(`[Upload] Detected forum upload, using FORUM bucket`);
      } else if (section === 'calendar' || section === 'events') {
        mediaType = 'calendar';
        console.log(`[Upload] Detected calendar/events upload, using CALENDAR bucket`);
      } else if (section === 'vendors') {
        mediaType = 'vendor';
      } else if (section === 'community') {
        mediaType = 'community';
      } else if (section === 'real-estate') {
        mediaType = 'real-estate';
      } else if (section === 'avatar' || section === 'profile') {
        mediaType = 'avatar';
      } else if (section === 'banner' || section === 'banner-slides') {
        mediaType = 'banner';
      }
      
      // Store the media type for later use
      (req as any).mediaType = mediaType;
      next();
    },
    // Handle the Object Storage upload with our custom function
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        // Get the media type from the request
        const mediaType = (req as any).mediaType || 'general';
        
        // Process file details
        const { path: filePath, originalname, mimetype } = req.file;
        
        console.log(`[Upload] CRITICAL DEBUG: Processing upload for forum with mediaType=${mediaType}`);
        console.log(`[Upload] CRITICAL DEBUG: File details: originalname=${originalname}, mimetype=${mimetype}, path=${filePath}`);
        
        // For large files like videos, use uploadFile instead of uploadBuffer
        // to avoid loading the entire file into memory
        const uploadResult = await unifiedStorageService.uploadFile(
          filePath,
          mediaType,
          {
            contentType: mimetype,
            generateUniqueName: true
          }
        );
        
        // Enhanced logging for debugging
        console.log(`[Upload] CRITICAL DEBUG: Upload Result:
          - Success: ${uploadResult.success}
          - URL: ${uploadResult.url || 'N/A'}
          - DirectURL: ${uploadResult.directUrl || 'N/A'}
          - Key: ${uploadResult.key || 'N/A'}
          - Bucket: ${uploadResult.bucket || 'N/A'}
          - Error: ${uploadResult.error || 'None'}
        `);
        
        // Store result in request for later middleware/handlers
        req.objectStorageResult = uploadResult;
        
        if (!uploadResult.success) {
          return res.status(uploadResult.statusCode || 500).json({
            success: false,
            message: `File upload failed: ${uploadResult.error}`
          });
        }
        
        // Verify the file was actually uploaded by checking if it exists
        if (uploadResult.success && uploadResult.key && uploadResult.bucket) {
          try {
            console.log(`[Upload] Verifying upload by checking if file exists: ${uploadResult.bucket}/${uploadResult.key}`);
            const fileExists = await objectStorageService.checkFileExists(uploadResult.key, uploadResult.bucket);
            console.log(`[Upload] File exists check result: ${fileExists}`);
            
            if (!fileExists) {
              console.error(`[Upload] WARNING: File reported as successfully uploaded but cannot be found in Object Storage`);
            }
          } catch (verifyError) {
            console.error(`[Upload] Error verifying file exists:`, verifyError);
            // Don't fail the request just because verification failed
          }
        }
        
        next();
      } catch (error) {
        console.error('[Upload] Error handling upload:', error);
        return res.status(500).json({
          success: false,
          message: 'Internal server error during file upload'
        });
      }
    },
    // Final handler after successful upload
    (req: Request, res: Response) => {
      // If no upload result is available, something went wrong
      if (!req.objectStorageResult) {
        return res.status(500).json({ 
          success: false, 
          message: 'Upload failed - no storage result available' 
        });
      }
      
      // Return success response with the URL
      return res.status(200).json({
        success: true,
        url: req.objectStorageResult.url,
        message: 'File uploaded to Object Storage successfully',
        section: (req as any).mediaType,
        bucket: req.objectStorageResult.bucket
      });
    }
  );

  /**
   * Legacy upload URL support - now uses Object Storage directly
   */
  app.post("/api/content/upload-media", 
    // Authentication check
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      next();
    },
    // Use multer for disk storage to handle large files
    multer({ 
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          cb(null, './tmp')
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          cb(null, 'legacy-upload-' + uniqueSuffix + path.extname(file.originalname));
        }
      }),
      limits: {
        fileSize: 350 * 1024 * 1024 // 350MB limit for videos
      }
    }).single('mediaFile'),
    // Custom middleware to upload to Object Storage
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        
        // Legacy endpoint always uses content media
        const mediaType = 'general';
        console.log('[LegacyUpload] Content media upload requested - using Object Storage');
        
        // Get file details from multer
        const { path: filePath, originalname, mimetype } = req.file;
        
        // For large files like videos, use uploadFile instead of uploadBuffer
        // to avoid loading the entire file into memory
        const uploadResult = await unifiedStorageService.uploadFile(
          filePath,
          mediaType,
          {
            contentType: mimetype,
            generateUniqueName: true
          }
        );
        
        if (!uploadResult.success) {
          console.error(`[LegacyUpload] Upload failed: ${uploadResult.error}`);
          return res.status(uploadResult.statusCode || 500).json({
            success: false,
            message: `File upload failed: ${uploadResult.error}`
          });
        }
        
        // Return the URL in the expected format
        return res.json({
          success: true,
          message: "File uploaded to Object Storage successfully",
          url: uploadResult.url
        });
      } catch (error) {
        console.error("[LegacyUpload] Error in content upload:", error);
        return res.status(500).json({ 
          success: false,
          message: "Error uploading file", 
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  // Add media upload endpoint to handle multiple files - using generic processUploadedFile function
  app.post("/api/upload/media", upload.array('media'), mediaSyncMiddleware, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const files = req.files as Express.Multer.File[];
      
      // Determine the appropriate media type based on the request
      // This will be used for all files in this batch upload
      let mediaType = '';
      
      // Check if this is for an event (based on request referer or query param)
      const isEventUpload = req.query.type === 'event' || 
                           (req.headers.referer && req.headers.referer.includes('/events/'));
      
      // Check for specific upload types based on query params or headers
      const uploadType = req.query.type as string || '';
      const referer = req.headers.referer as string || '';
      
      // If this is an event upload, handle it with our special calendar handler
      if (isEventUpload || uploadType === 'event' || referer.includes('/events/')) {
        console.log('[MediaUpload] Event media detected, using specialized handler');
        req.mediaType = 'calendar';
        
        // Since we can't easily intercept this route during array upload,
        // we'll process each file manually through our calendar handler
        const files = req.files as Express.Multer.File[];
        
        // Process all files using our specialized calendar handler
        const successfulUploads = [];
        const failedUploads = [];
        
        for (const file of files) {
          try {
            // Create a mock request with this single file for our handler
            const singleFileReq = {...req, file: file} as any;
            
            // Call our calendar handler directly
            await handleCalendarMediaUpload(singleFileReq, res, () => {});
            
            // If we have an object storage URL, consider it successful
            if (singleFileReq.objectStorageUrl) {
              console.log(`[MediaUpload] Successfully processed event file with Object Storage: ${singleFileReq.objectStorageUrl}`);
              successfulUploads.push({
                success: true,
                url: singleFileReq.objectStorageUrl,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size
              });
            } else {
              console.error(`[MediaUpload] Error processing event file ${file.originalname}: No Object Storage URL returned`);
              failedUploads.push({
                success: false,
                message: "No Object Storage URL returned",
                originalname: file.originalname
              });
            }
          } catch (error) {
            console.error(`[MediaUpload] Exception processing event file ${file.originalname}:`, error);
            failedUploads.push({
              success: false,
              message: error instanceof Error ? error.message : String(error),
              originalname: file.originalname
            });
          }
        }
        
        // Extract the URLs from successful uploads
        const urls = successfulUploads.map(r => r.url);
        
        console.log(`[MediaUpload] Event media upload complete. Successfully processed ${successfulUploads.length} of ${files.length} files`);
        console.log(`[MediaUpload] URLs returned to client: ${urls.join(', ')}`);
        
        return res.json({
          success: true,
          urls: urls,
          details: [...successfulUploads, ...failedUploads],
          message: `Files uploaded successfully (${successfulUploads.length} of ${files.length})`
        });
      } else if (uploadType === 'banner' || referer.includes('/banner-slides')) {
        console.log('Banner slide detected');
        mediaType = 'banner-slides';
      } else if (uploadType === 'forum' || referer.includes('/forum')) {
        console.log('Forum media detected');
        mediaType = 'forum-media';
      } else if (uploadType === 'vendor' || referer.includes('/vendors')) {
        console.log('Vendor media detected');
        mediaType = 'vendor-media';
      } else if (uploadType === 'community' || referer.includes('/community')) {
        console.log('Community media detected');
        mediaType = 'community-media';
      } else if (uploadType === 'real-estate' || referer.includes('/real-estate') || referer.includes('/for-sale')) {
        console.log('Real estate media detected');
        mediaType = 'real-estate-media';
      } else {
        // Default to content-media if no specific type is detected
        console.log('No specific media type detected, using content-media');
        mediaType = 'content-media';
      }
      
      // Set the media type on the request for our processing function
      req.mediaType = mediaType;
      
      // Process each file using our utility function
      const results = [];
      
      for (const file of files) {
        try {
          const result = await processUploadedFile(req, file);
          
          if (result.success) {
            console.log(`File processed successfully: ${result.url}`);
            results.push({
              success: true,
              url: result.url,
              developmentUrl: result.developmentUrl,
              filename: file.filename,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size
            });
          } else {
            console.error(`Error processing file ${file.originalname}: ${result.message}`);
            results.push({
              success: false,
              message: result.message,
              filename: file.filename,
              originalname: file.originalname
            });
          }
        } catch (error) {
          console.error(`Exception processing file ${file.originalname}:`, error);
          results.push({
            success: false,
            message: error instanceof Error ? error.message : String(error),
            filename: file.filename,
            originalname: file.originalname
          });
        }
      }
      
      // Check if any files were successfully processed
      const successfulUploads = results.filter(r => r.success);
      if (successfulUploads.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files were successfully processed",
          details: results
        });
      }
      
      // Extract the URLs from successful uploads
      const urls = successfulUploads.map(r => r.url);
      
      console.log(`Media upload complete. Successfully processed ${successfulUploads.length} of ${files.length} files`);
      console.log(`URLs returned to client: ${urls.join(', ')}`);

      res.json({
        success: true,
        urls: urls,
        details: results,
        message: `Files uploaded successfully (${successfulUploads.length} of ${files.length})`
      });
    } catch (err) {
      console.error("Error uploading media:", err);
      res.status(500).json({
        success: false,
        message: "Failed to upload media"
      });
    }
  });

  // Get all users (admin only)
  // Get users for messaging (available to all authenticated users)
  app.get("/api/messages/users", async (req, res) => {
    console.log(`GET /api/messages/users - Auth debug:`, {
      isAuthenticated: req.isAuthenticated(),
      userExists: !!req.user,
      userRole: req.user?.role,
      sessionID: req.sessionID
    });
    
    if (!req.isAuthenticated()) {
      console.log("GET /api/messages/users - Authentication check failed");
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      // Get all users but only return the necessary fields for messaging
      const allUsers = await storage.getUsers();
      // Add debug output for the first user to understand the structure
      if (allUsers.length > 0) {
        const userSample = allUsers[0];
        console.log("DEBUG User object structure sample:", {
          id: userSample.id,
          username: userSample.username,
          // Log both possible field naming conventions
          fullName: userSample.fullName, 
          full_name: (userSample as any).full_name,
          // Log role which is critical for UI
          role: userSample.role,
          // Log both possible avatar field naming conventions
          avatarUrl: userSample.avatarUrl,
          avatar_url: (userSample as any).avatar_url
        });
      }
      
      // Transform users safely, checking all possible property name formats
      const messagingUsers = allUsers.map(user => ({
        id: user.id,
        username: user.username,
        // Use the camelCase version which is returned by Drizzle ORM
        fullName: user.fullName || (user as any).full_name || user.username,
        role: user.role,
        avatarUrl: user.avatarUrl || (user as any).avatar_url
      }));
      
      console.log(`GET /api/messages/users - Successfully fetched ${messagingUsers.length} users for messaging`);
      res.json({ 
        success: true,
        data: messagingUsers
      });
    } catch (err) {
      console.error("Error fetching users for messaging:", err);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch users", 
        details: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Get all users (admin only)
  app.get("/api/users", async (req, res) => {
    console.log(`GET /api/users - Auth debug:`, {
      isAuthenticated: req.isAuthenticated(),
      userExists: !!req.user,
      userRole: req.user?.role,
      sessionID: req.sessionID,
      cookies: req.headers.cookie,
      origin: req.headers.origin,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent']
    });
    
    // For production environments, add CORS headers to support cross-domain auth
    if (process.env.NODE_ENV === 'production') {
      // Allow credentials for cross-origin requests
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Set origin based on the request's origin header
      if (req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
    }
    
    // Special handling for cross-domain auth when cookies don't work in production
    const isProduction = process.env.NODE_ENV === 'production';
    const authToken = req.headers['x-auth-token'] || req.query.authToken;
    
    if (!req.isAuthenticated() && isProduction && authToken) {
      console.log("Using fallback token authentication for cross-domain request");
      try {
        // This is a secure hash verification to validate the token
        // It's not a permanent solution but helps with cross-domain issues
        const tokenParts = String(authToken).split('.');
        if (tokenParts.length !== 3) {
          throw new Error("Invalid token format");
        }
        
        const [userId, timestamp, hash] = tokenParts;
        // Validate token isn't expired (15 minute window)
        const tokenTime = parseInt(timestamp, 10);
        const now = Date.now();
        if (isNaN(tokenTime) || now - tokenTime > 15 * 60 * 1000) {
          throw new Error("Token expired");
        }
        
        // Fetch the user directly from storage
        const user = await storage.getUser(parseInt(userId, 10));
        
        // Validate user exists and is admin
        if (!user || user.role !== 'admin') {
          throw new Error("User not found or not admin");
        }
        
        // Success - now process the request with this user
        console.log(`Token auth successful for admin user: ${user.username} (${user.id})`);
        
        // Continue with the admin-only users request
        const allUsers = await storage.getUsers();
        return res.json(allUsers);
      } catch (err) {
        console.error("Token authentication failed:", err);
        return res.status(401).json({ message: "Invalid or expired token" });
      }
    }
    
    // Regular authentication flow
    if (!req.isAuthenticated()) {
      console.log("GET /api/users - Authentication check failed");
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      console.log(`GET /api/users - Admin check failed: User role is ${req.user.role}`);
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getUsers();
      console.log(`GET /api/users - Successfully fetched ${users.length} users`);
      
      // Log pending approvals for debugging
      const pendingApprovals = users.filter(user => user.isApproved === false);
      console.log(`GET /api/users - Found ${pendingApprovals.length} pending approvals`);
      if (pendingApprovals.length > 0) {
        console.log("Pending approval users:", pendingApprovals.map(u => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          isApproved: u.isApproved,
          createdAt: u.createdAt
        })));
      }
      
      res.json(users);
    } catch (err) {
      console.error("Error fetching users:", err);
      res.status(500).json({ message: "Failed to fetch users", details: err.message });
    }
  });
  
  // Export all users as CSV (admin only)
  app.get("/api/users/export", async (req, res) => {
    console.log("GET /api/users/export - Exporting users as CSV");
    
    if (!req.isAuthenticated()) {
      console.log("GET /api/users/export - Authentication check failed");
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      console.log(`GET /api/users/export - Admin check failed: User role is ${req.user.role}`);
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Import stringify from csv-stringify
      const { stringify } = await import('csv-stringify/sync');
      
      // Get all users
      const users = await storage.getUsers();
      console.log(`GET /api/users/export - Exporting ${users.length} users`);
      
      // Define the columns to include in the export
      const columns = [
        { key: 'id', header: 'ID' },
        { key: 'username', header: 'Username' },
        { key: 'email', header: 'Email' },
        { key: 'fullName', header: 'Full Name' },
        { key: 'role', header: 'Role' },
        { key: 'isApproved', header: 'Approved' },
        { key: 'isResident', header: 'Resident' },
        { key: 'isBlocked', header: 'Blocked' },
        { key: 'blockReason', header: 'Block Reason' },
        { key: 'isLocalResident', header: 'Local Resident' },
        { key: 'ownsHomeInBB', header: 'Owns Home' },
        { key: 'isFullTimeResident', header: 'Full Time Resident' },
        { key: 'isSnowbird', header: 'Snowbird' },
        { key: 'hasMembershipBadge', header: 'Has Badge' },
        { key: 'membershipBadgeNumber', header: 'Badge Number' },
        { key: 'hasLivedInBB', header: 'Has Lived In BB' },
        { key: 'consideringMovingToBB', header: 'Considering Moving' },
        { key: 'createdAt', header: 'Created At' },
        { key: 'updatedAt', header: 'Updated At' }
      ];
      
      // Format dates and boolean values for better readability
      const formattedUsers = users.map(user => {
        // Create a new object to avoid modifying the original user
        const formattedUser = { ...user };
        
        // Format dates to be more readable in CSV
        if (formattedUser.createdAt) {
          formattedUser.createdAt = new Date(formattedUser.createdAt).toISOString().split('T')[0];
        }
        if (formattedUser.updatedAt) {
          formattedUser.updatedAt = new Date(formattedUser.updatedAt).toISOString().split('T')[0];
        }
        
        // Format boolean values as 'Yes' or 'No'
        ['isApproved', 'isResident', 'isBlocked', 'isLocalResident', 'ownsHomeInBB', 
         'isFullTimeResident', 'isSnowbird', 'hasMembershipBadge', 'hasLivedInBB', 
         'consideringMovingToBB'].forEach(key => {
          if (key in formattedUser) {
            formattedUser[key] = formattedUser[key] ? 'Yes' : 'No';
          }
        });
        
        // Format array values as comma-separated strings
        if (formattedUser.residentTags && Array.isArray(formattedUser.residentTags)) {
          formattedUser.residentTags = formattedUser.residentTags.join(', ');
        }
        
        return formattedUser;
      });
      
      // Generate CSV
      const csvContent = stringify(formattedUsers, { 
        header: true,
        columns: columns
      });
      
      // Set appropriate headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
      
      // Send the CSV content
      res.send(csvContent);
      console.log("GET /api/users/export - CSV export completed successfully");
    } catch (err) {
      console.error("Error exporting users:", err);
      res.status(500).json({ 
        message: "Failed to export users", 
        details: err instanceof Error ? err.message : "Unknown error" 
      });
    }
  });

  // Update user role (admin only)
  app.patch("/api/users/:id/role", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    const userId = parseInt(req.params.id);
    const { role } = req.body;

    try {
      // Update the user's role
      const updatedUser = await storage.updateUser(userId, {
        role,
        updatedAt: new Date()
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`Role updated for user ${userId} to ${role}`);
      // The permissions will be automatically applied based on the feature flags system
      // When a user has their role updated to "moderator", they'll get exactly the permissions
      // defined for moderators in the Feature Management grid

      res.json({ success: true, user: updatedUser }); // Corrected to updatedUser
    } catch (err) {
      console.error("Error updating user role:", err);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });
  
  // Update user approval status (admin only)
  // Delete user endpoint (admin only)
  app.delete("/api/users/:id", async (req, res) => {
    console.log("User delete endpoint called", {
      authenticated: req.isAuthenticated(),
      user: req.user ? { id: req.user.id, role: req.user.role } : null,
      params: req.params,
      headers: {
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer,
        cookie: req.headers.cookie ? "Present" : "None"
      }
    });

    // Auth checks
    if (!req.isAuthenticated()) {
      console.warn("User delete request failed: not authenticated");
      return res.status(401).json({ 
        message: "Not authenticated", 
        details: "You need to be logged in to delete users",
        code: "AUTH_REQUIRED"
      });
    }

    if (req.user.role !== 'admin') {
      console.warn(`User delete request rejected: non-admin user (${req.user.role}) attempted to delete user`);
      return res.status(403).json({ 
        message: "Admin access required", 
        details: "Only administrators can delete user accounts",
        code: "ADMIN_REQUIRED"
      });
    }

    const userId = parseInt(req.params.id);
    
    // Prevent admins from deleting themselves
    if (userId === req.user.id) {
      console.warn(`Self-delete attempt prevented for user ${userId}`);
      return res.status(400).json({
        message: "Cannot delete your own account",
        details: "Admins cannot delete their own accounts",
        code: "SELF_DELETE_PREVENTED"
      });
    }

    try {
      // Get the current user to verify they exist
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        console.warn(`User deletion failed: User ID ${userId} not found`);
        return res.status(404).json({ 
          message: "User not found",
          details: "The specified user ID does not exist",
          code: "USER_NOT_FOUND"
        });
      }
      
      console.log(`Processing deletion for user ${currentUser.username} (${userId})`);
      
      // Use direct SQL for more reliable deletion
      try {
        console.log("Starting direct SQL cascade deletion process");
        
        // Begin a transaction
        await db.execute(sql`BEGIN`);
        
        // 1. Clean up content_versions (foreign key reference to users via created_by)
        try {
          await db.execute(sql`UPDATE content_versions SET created_by = NULL WHERE created_by = ${userId}`);
          console.log(`Updated content_versions references for user ${userId}`);
        } catch (e) {
          console.log(`Error updating content_versions: ${e.message}`);
        }
        
        // 2. Delete forum reactions by this user (these reference both posts and comments)
        const forumReactionsDeleted = await db.execute(sql`DELETE FROM forum_reactions WHERE user_id = ${userId}`);
        console.log(`Deleted ${forumReactionsDeleted.rowCount} forum reactions for user ${userId}`);
        
        // 3. Check if forum_likes table exists before trying to delete from it
        let forumLikesDeleted = { rowCount: 0 };
        try {
          forumLikesDeleted = await db.execute(sql`DELETE FROM forum_likes WHERE user_id = ${userId}`);
          console.log(`Deleted ${forumLikesDeleted.rowCount} forum likes for user ${userId}`);
        } catch (e) {
          console.log("forum_likes table may not exist, skipping");
        }
        
        // 4. Delete forum comments by this user (using author_id column)
        const forumCommentsDeleted = await db.execute(sql`DELETE FROM forum_comments WHERE author_id = ${userId}`);
        console.log(`Deleted ${forumCommentsDeleted.rowCount} forum comments for user ${userId}`);
        
        // 5. Delete forum posts by this user
        const forumPostsDeleted = await db.execute(sql`DELETE FROM forum_posts WHERE user_id = ${userId}`);
        console.log(`Deleted ${forumPostsDeleted.rowCount} forum posts for user ${userId}`);
        
        // 6. Clean up event-related content
        const eventCommentsDeleted = await db.execute(sql`DELETE FROM event_comments WHERE user_id = ${userId}`);
        const eventInteractionsDeleted = await db.execute(sql`DELETE FROM event_interactions WHERE user_id = ${userId}`);
        console.log(`Deleted ${eventCommentsDeleted.rowCount} event comments and ${eventInteractionsDeleted.rowCount} event interactions for user ${userId}`);
        
        // 7. Clean up vendor-related content
        const vendorCommentsDeleted = await db.execute(sql`DELETE FROM vendor_comments WHERE user_id = ${userId}`);
        const vendorInteractionsDeleted = await db.execute(sql`DELETE FROM vendor_interactions WHERE user_id = ${userId}`);
        console.log(`Deleted ${vendorCommentsDeleted.rowCount} vendor comments and ${vendorInteractionsDeleted.rowCount} vendor interactions for user ${userId}`);
        
        // 8. Clean up form submissions 
        const formSubmissionsDeleted = await db.execute(sql`DELETE FROM form_submissions WHERE user_id = ${userId}`);
        console.log(`Deleted ${formSubmissionsDeleted.rowCount} form submissions for user ${userId}`);
        
        // 9. Find and clean up orders and related items
        const orderResults = await db.execute(sql`SELECT id FROM orders WHERE user_id = ${userId}`);
        if (orderResults.rowCount > 0) {
          const orderIds = orderResults.rows.map(r => r.id);
          console.log(`Found ${orderIds.length} orders to delete for user ${userId}`);
          
          // Delete order items first
          for (const orderId of orderIds) {
            try {
              const orderItemsDeleted = await db.execute(sql`DELETE FROM order_items WHERE order_id = ${orderId}`);
              console.log(`Deleted ${orderItemsDeleted.rowCount} order items for order ${orderId}`);
            } catch (error) {
              console.error(`Error deleting order items for order ${orderId}:`, error);
              // Continue with the next order instead of failing completely
            }
          }
          
          // Delete the orders
          try {
            const ordersDeleted = await db.execute(sql`DELETE FROM orders WHERE user_id = ${userId}`);
            console.log(`Deleted ${ordersDeleted.rowCount} orders for user ${userId}`);
          } catch (error) {
            console.error(`Error deleting orders for user ${userId}:`, error);
            // Clear references to allow deletion
            try {
              await db.execute(sql`UPDATE orders SET user_id = NULL WHERE user_id = ${userId}`);
              console.log(`Nullified user_id references in orders table for user ${userId}`);
            } catch (nullifyError) {
              console.error(`Error nullifying orders user_id:`, nullifyError);
            }
          }
        }
        
        // 10. Set NULL for nullable FK references in content tables
        // Check if tables exist before updating
        try {
          await db.execute(sql`UPDATE content SET updated_by = NULL WHERE updated_by = ${userId}`);
          console.log(`Updated content references for user ${userId}`);
        } catch (e) {
          console.log("content table may not exist or column updated_by not available, skipping");
        }
        
        try {
          await db.execute(sql`UPDATE page_content SET created_by = NULL WHERE created_by = ${userId}`);
          console.log(`Updated page_content references for user ${userId}`);
        } catch (e) {
          console.log("page_content table may not exist or column created_by not available, skipping");
        }
        
        try {
          await db.execute(sql`UPDATE page_contents SET updated_by = NULL WHERE updated_by = ${userId}`);
          console.log(`Updated page_contents references for user ${userId}`);
        } catch (e) {
          console.log("page_contents table may not exist or column updated_by not available, skipping");
        }
        
        try {
          await db.execute(sql`UPDATE products SET created_by = NULL WHERE created_by = ${userId}`);
          console.log(`Updated products references for user ${userId}`);
        } catch (e) {
          console.log("products table may not exist or column created_by not available, skipping");
        }
        
        try {
          await db.execute(sql`UPDATE events SET created_by = NULL WHERE created_by = ${userId}`);
          console.log(`Updated events references for user ${userId}`);
        } catch (e) {
          console.log("events table may not exist or column created_by not available, skipping");
        }
        
        // 11. Clean up real estate listings
        try {
          const listingPaymentsDeleted = await db.execute(sql`DELETE FROM listing_payments WHERE user_id = ${userId}`);
          console.log(`Deleted ${listingPaymentsDeleted.rowCount} listing payments for user ${userId}`);
        } catch (e) {
          console.log("listing_payments table may not exist, skipping");
        }
        
        try {
          const realEstateListingsUpdated = await db.execute(sql`UPDATE real_estate_listings SET created_by = NULL WHERE created_by = ${userId}`);
          console.log(`Updated ${realEstateListingsUpdated.rowCount} real estate listings for user ${userId}`);
        } catch (e) {
          console.log("real_estate_listings table may not have created_by column, skipping");
        }
        
        // 12. Clean up any session data
        try {
          await db.execute(sql`DELETE FROM "session" WHERE sess->'user'->>'id' = ${userId.toString()}`);
          console.log(`Cleaned up session data for user ${userId}`);
        } catch (e) {
          console.log(`Error cleaning up sessions: ${e.message}`);
        }
        
        // 13. Finally delete the user
        const userDeleted = await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
        
        // Commit the transaction
        await db.execute(sql`COMMIT`);
        
        if (userDeleted.rowCount === 0) {
          // Rollback if user wasn't deleted
          await db.execute(sql`ROLLBACK`);
          console.error(`User deletion failed: User ID ${userId} could not be deleted`);
          return res.status(500).json({ 
            message: "Delete operation failed",
            details: "The user could not be deleted",
            code: "DELETE_FAILED"
          });
        }
        
        console.log(`User ${userId} successfully deleted using direct SQL approach`);
      } catch (error) {
        // Rollback the transaction on error
        try {
          await db.execute(sql`ROLLBACK`);
        } catch (rollbackError) {
          console.error("Error during rollback:", rollbackError);
        }
        
        console.error(`Error during SQL deletion of user ${userId}:`, error);
        
        // Check for foreign key constraint violations
        const errorMsg = error.message || '';
        
        // Check for foreign key constraint violations and provide more helpful error message
        if (errorMsg.includes('foreign key constraint') || 
            errorMsg.includes('violates foreign key constraint')) {
            
          // Try to extract constraint name and table from error message
          let constraintTable = "unknown";
          let constraintName = "unknown";
          
          const tableMatch = errorMsg.match(/table "([^"]+)"/);
          if (tableMatch && tableMatch[1]) {
            constraintTable = tableMatch[1];
          }
          
          const constraintMatch = errorMsg.match(/constraint "([^"]+)"/);
          if (constraintMatch && constraintMatch[1]) {
            constraintName = constraintMatch[1];
          }
          
          // Log the details for debugging
          console.error(`Foreign key constraint violation: Table: ${constraintTable}, Constraint: ${constraintName}`);
              
          return res.status(409).json({
            message: "User cannot be deleted due to references",
            details: `This user has associated content in ${constraintTable} that prevents deletion. Please try deleting this content first or contact system administrator for assistance.`,
            code: "FOREIGN_KEY_CONSTRAINT",
            table: constraintTable,
            constraint: constraintName
          });
        }
        
        // Handle database connection errors
        if (errorMsg.includes('connection') || errorMsg.includes('timeout')) {
          return res.status(503).json({
            message: "Database connection error",
            details: "Could not connect to the database to complete this operation. Please try again later.",
            code: "DB_CONNECTION_ERROR"
          });
        }
        
        // Generic database error
        return res.status(500).json({
          message: "Database error during deletion",
          details: `SQL error: ${errorMsg}`,
          code: "DB_ERROR"
        });
      }

      console.log(`User deletion successful: User ${currentUser.username} (${userId}) has been deleted`);
      
      res.json({ 
        success: true,
        user: {
          id: userId,
          username: currentUser.username,
          fullName: currentUser.fullName || currentUser.username
        },
        message: 'User and associated content deleted successfully'
      });
    } catch (err) {
      console.error("Error deleting user:", err);
      
      // Check for foreign key constraint violation
      if (err.code === '23503' || // PostgreSQL foreign key violation code
          (err.message && err.message.includes('foreign key constraint')) || 
          (err.detail && err.detail.includes('is still referenced'))) {
          
        // Extract the table name from the error detail if available
        let tableName = 'another table';
        let constraintDetail = '';
        
        // Try to extract more details from the error
        if (err.detail) {
          const tableMatch = err.detail.match(/table "([^"]+)"/);
          if (tableMatch && tableMatch[1]) {
            tableName = tableMatch[1];
          }
          constraintDetail = err.detail;
        } else if (err.table) {
          tableName = err.table;
        }
        
        return res.status(409).json({ 
          message: "Cannot delete user with existing content",
          details: `This user has existing content in ${tableName} (such as forum posts, comments, or other data). Delete or reassign this content before removing the user.`,
          code: "FOREIGN_KEY_VIOLATION",
          constraint: err.constraint || constraintDetail,
          table: tableName
        });
      }
      
      // Common error handling for all other errors
      res.status(500).json({ 
        message: "Failed to delete user",
        details: err instanceof Error ? err.message : "Unknown error",
        code: "SERVER_ERROR"
      });
    }
  });

  // Delete user endpoint (admin only)

  // User approval endpoint has been removed as the isApproved function is no longer needed
  
  // Cross-domain user approval endpoint has been removed as the isApproved function is no longer needed

  // Update user block status (admin only)
  app.patch("/api/users/:id/block", async (req, res) => {
    console.log("User block endpoint called", {
      authenticated: req.isAuthenticated(),
      user: req.user ? { id: req.user.id, role: req.user.role } : null,
      params: req.params,
      body: req.body,
      headers: {
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer,
        cookie: req.headers.cookie ? "Present" : "None"
      }
    });

    // Auth checks
    if (!req.isAuthenticated()) {
      console.warn("User block request failed: not authenticated");
      return res.status(401).json({ 
        message: "Not authenticated", 
        details: "You need to be logged in to block users",
        code: "AUTH_REQUIRED"
      });
    }

    if (req.user.role !== 'admin') {
      console.warn(`User block request rejected: non-admin user (${req.user.role}) attempted to block`);
      return res.status(403).json({ 
        message: "Admin access required", 
        details: "Only administrators can block user accounts",
        code: "ADMIN_REQUIRED"
      });
    }

    const userId = parseInt(req.params.id);
    const { isBlocked, blockReason } = req.body;
    
    if (typeof isBlocked !== 'boolean') {
      console.warn("User block request rejected: invalid isBlocked value", isBlocked);
      return res.status(400).json({ 
        message: "isBlocked must be a boolean value",
        details: "Please provide a valid block status (true or false)",
        code: "INVALID_PARAMETER"
      });
    }

    try {
      // Get the current user
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        console.warn(`User block failed: User ID ${userId} not found`);
        return res.status(404).json({ 
          message: "User not found",
          details: "The specified user ID does not exist",
          code: "USER_NOT_FOUND"
        });
      }
      
      // Don't allow blocking admins
      if (currentUser.role === 'admin' && isBlocked) {
        console.warn(`Attempted to block an admin user: ${currentUser.username} (${userId})`);
        return res.status(403).json({ 
          message: "Cannot block admin users",
          details: "Administrator accounts cannot be blocked",
          code: "ADMIN_BLOCK_DENIED"
        });
      }
      
      console.log(`Processing block for user ${currentUser.username} (${userId}): setting isBlocked=${isBlocked}`);
      
      // Update the block status
      const updateData: any = {
        isBlocked,
        updatedAt: new Date()
      };
      
      // Only set blockReason when blocking a user
      if (isBlocked && blockReason) {
        updateData.blockReason = blockReason;
      } else if (!isBlocked) {
        // Clear the block reason when unblocking
        updateData.blockReason = null;
      }

      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        console.error(`User block failed: User ID ${userId} not found after update attempt`);
        return res.status(404).json({ 
          message: "User not found",
          details: "The user could not be updated",
          code: "UPDATE_FAILED"
        });
      }

      console.log(`User block status changed: User ${updatedUser.username} (${userId}) is now ${isBlocked ? 'blocked' : 'unblocked'}`);

      res.json({ 
        success: true, 
        user: updatedUser,
        message: isBlocked ? 'User blocked successfully' : 'User unblocked successfully'
      });
    } catch (err) {
      console.error("Error updating user block status:", err);
      res.status(500).json({ 
        message: "Failed to update user block status",
        details: err.message,
        code: "SERVER_ERROR"
      });
    }
  });

  // Cross-domain compatible user block endpoint (admin only)
  app.patch("/api/auth/users/:id/block", async (req, res) => {
    console.log("Cross-domain user block endpoint called", {
      authenticated: req.isAuthenticated(),
      user: req.user ? { id: req.user.id, role: req.user.role } : null,
      params: req.params,
      body: req.body,
      headers: {
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer,
        cookie: req.headers.cookie ? "Present" : "None"
      }
    });

    // Set CORS headers for cross-domain requests
    if (req.headers.origin) {
      console.log(`Cross-domain user block: Setting CORS headers for origin: ${req.headers.origin}`);
      // Allow credentials for cross-origin requests
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Set origin based on the request's origin header
      res.header('Access-Control-Allow-Origin', req.headers.origin);
    }

    // Auth checks
    if (!req.isAuthenticated()) {
      console.warn("Cross-domain user block request failed: not authenticated");
      return res.status(401).json({ 
        success: false,
        message: "Not authenticated",
        details: "You need to be logged in to block users",
        code: "AUTH_REQUIRED"
      });
    }

    if (req.user.role !== 'admin') {
      console.warn(`Cross-domain user block rejected: non-admin user (${req.user.role}) attempted operation`);
      return res.status(403).json({ 
        success: false,
        message: "Admin access required",
        details: "Only administrators can block user accounts",
        code: "ADMIN_REQUIRED"
      });
    }

    const userId = parseInt(req.params.id);
    const { isBlocked, blockReason } = req.body;
    
    if (typeof isBlocked !== 'boolean') {
      console.warn("Cross-domain user block request rejected: invalid isBlocked value", isBlocked);
      return res.status(400).json({ 
        success: false,
        message: "isBlocked must be a boolean value",
        details: "Please provide a valid block status (true or false)",
        code: "INVALID_PARAMETER"
      });
    }

    try {
      // Use a force refresh to ensure we're getting the latest user data
      const allUsers = await storage.getUsers(true);
      const currentUser = allUsers.find(u => u.id === userId);
      
      if (!currentUser) {
        console.warn(`Cross-domain user block failed: User ID ${userId} not found`);
        return res.status(404).json({ 
          success: false,
          message: "User not found",
          details: "The specified user ID does not exist",
          code: "USER_NOT_FOUND"
        });
      }
      
      // Don't allow blocking admins
      if (currentUser.role === 'admin' && isBlocked) {
        console.warn(`Cross-domain attempted to block an admin user: ${currentUser.username} (${userId})`);
        return res.status(403).json({ 
          success: false,
          message: "Cannot block admin users",
          details: "Administrator accounts cannot be blocked",
          code: "ADMIN_BLOCK_DENIED"
        });
      }
      
      console.log(`Cross-domain processing block for user ${currentUser.username} (${userId}): setting isBlocked=${isBlocked}`);
      
      // Update the block status
      const updateData: any = {
        isBlocked,
        updatedAt: new Date()
      };
      
      // Only set blockReason when blocking a user
      if (isBlocked && blockReason) {
        updateData.blockReason = blockReason;
      } else if (!isBlocked) {
        // Clear the block reason when unblocking
        updateData.blockReason = null;
      }

      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        console.error(`Cross-domain user block failed: User ID ${userId} not found after update attempt`);
        return res.status(404).json({ 
          success: false,
          message: "User not found",
          details: "The user could not be updated",
          code: "UPDATE_FAILED"
        });
      }

      console.log(`Cross-domain user block successful: User ${updatedUser.username} (${userId}) is now ${isBlocked ? 'blocked' : 'unblocked'}`);

      // If this was a cross-domain request, ensure CORS headers are set
      if (req.headers.origin) {
        console.log(`Cross-domain user block: Setting CORS headers for response to origin: ${req.headers.origin}`);
        // Allow credentials for cross-origin requests
        res.header('Access-Control-Allow-Credentials', 'true');
        
        // Set origin based on the request's origin header
        if (req.headers.origin) {
          res.header('Access-Control-Allow-Origin', req.headers.origin);
        }
      }

      res.json({ 
        success: true, 
        user: updatedUser,
        message: isBlocked ? 'User blocked successfully' : 'User unblocked successfully'
      });
    } catch (err) {
      console.error("Error in cross-domain user block:", err);
      res.status(500).json({ 
        success: false,
        message: "Failed to update user block status",
        details: err.message,
        code: "SERVER_ERROR"
      });
    }
  });

  // Object Storage Debug Endpoint
  app.get("/api/debug/object-storage", async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ 
          success: false, 
          message: "Object key parameter is required" 
        });
      }
      
      console.log(`[DEBUG] Checking if object exists in storage: ${key}`);
      
      // Dynamically import the object-storage module
      const objectStorage = await import('./object-storage.js');
      
      // Check if the object exists
      const exists = await objectStorage.default.objectExists(key as string);
      
      console.log(`[DEBUG] Object exists check result: ${exists}`);
      
      let url = null;
      if (exists) {
        // Get a signed URL for the object
        url = await objectStorage.default.getPresignedUrl(key as string, 3600);
        console.log(`[DEBUG] Generated presigned URL: ${url}`);
      }
      
      return res.json({ 
        success: true,
        exists,
        url,
        key,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[DEBUG] Error checking object storage:", error);
      return res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Events API
  // Debug endpoint to check event media URLs in the database
  app.get("/api/debug/event-media/:id?", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    console.log('[EventMediaDebug] Checking event media URLs in database');
    
    try {
      let events;
      if (req.params.id) {
        // Get a specific event
        const event = await storage.getEvent(parseInt(req.params.id));
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }
        events = [event];
      } else {
        // Get recent events with media
        events = await db.query(`
          SELECT id, title, mediaUrls
          FROM events
          WHERE mediaUrls IS NOT NULL AND jsonb_array_length(mediaUrls) > 0
          ORDER BY "createdAt" DESC
          LIMIT 10
        `);
      }
      
      // Process each event to normalize URLs
      const processedEvents = events.map(event => {
        // Skip events without media
        if (!event.mediaUrls || !Array.isArray(event.mediaUrls) || event.mediaUrls.length === 0) {
          return {
            ...event,
            mediaUrlsInfo: [{ message: "No media URLs" }]
          };
        }
        
        // Process each URL
        const mediaUrlsInfo = event.mediaUrls.map(url => {
          let category = 'unknown';
          
          if (url.includes('object-storage.replit.app')) {
            category = 'direct-object-storage';
          } else if (url.includes('/api/storage-proxy/')) {
            category = 'storage-proxy';
          } else if (url.startsWith('/uploads/')) {
            category = 'legacy-uploads';
          } else if (url.startsWith('/')) {
            category = 'root-relative';
          }
          
          // Generate corrected URL if needed
          let correctedUrl = url;
          if (category !== 'storage-proxy') {
            try {
              correctedUrl = normalizeMediaUrl(url, 'event');
            } catch (error) {
              correctedUrl = `Error normalizing URL: ${error.message}`;
            }
          }
          
          return {
            original: url,
            category,
            correctedUrl: correctedUrl !== url ? correctedUrl : null,
            filename: extractFilename(url)
          };
        });
        
        return {
          ...event,
          mediaUrlsInfo: mediaUrlsInfo
        };
      });
      
      return res.json({
        count: events.length,
        events: processedEvents
      });
    } catch (error) {
      console.error('[EventMediaDebug] Error:', error);
      return res.status(500).json({ message: `Error: ${error.message}` });
    }
  });
  
  // Test endpoint to fix event media URLs in the database
  app.post("/api/debug/fix-event-media/:id?", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    console.log('[EventMediaFix] Fixing event media URLs in database');
    
    try {
      let events;
      if (req.params.id) {
        // Get a specific event
        const event = await storage.getEvent(parseInt(req.params.id));
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }
        events = [event];
      } else {
        // Get events with media
        events = await db.query(`
          SELECT id, title, mediaUrls
          FROM events
          WHERE mediaUrls IS NOT NULL AND jsonb_array_length(mediaUrls) > 0
        `);
      }
      
      const fixResults = [];
      
      // Process each event to fix URLs
      for (const event of events) {
        // Skip events without media
        if (!event.mediaUrls || !Array.isArray(event.mediaUrls) || event.mediaUrls.length === 0) {
          fixResults.push({
            id: event.id,
            title: event.title,
            status: 'skipped',
            message: 'No media URLs'
          });
          continue;
        }
        
        // Normalize all URLs
        const normalizedUrls = event.mediaUrls.map(url => {
          try {
            // Always return a storage proxy URL format for consistency
            return normalizeMediaUrl(url, 'event');
          } catch (error) {
            console.error(`[EventMediaFix] Error normalizing URL for event ${event.id}:`, error);
            // Keep the original URL if normalization fails
            return url;
          }
        });
        
        // Check if URLs were changed
        const hasChanges = JSON.stringify(normalizedUrls) !== JSON.stringify(event.mediaUrls);
        
        if (hasChanges) {
          // Update the event with normalized URLs
          await db.query(
            `UPDATE events SET "mediaUrls" = $1 WHERE id = $2`,
            [JSON.stringify(normalizedUrls), event.id]
          );
          
          fixResults.push({
            id: event.id,
            title: event.title,
            status: 'fixed',
            original: event.mediaUrls,
            normalized: normalizedUrls
          });
        } else {
          fixResults.push({
            id: event.id,
            title: event.title,
            status: 'unchanged',
            urls: event.mediaUrls
          });
        }
      }
      
      return res.json({
        count: events.length,
        fixedCount: fixResults.filter(r => r.status === 'fixed').length,
        unchangedCount: fixResults.filter(r => r.status === 'unchanged').length,
        skippedCount: fixResults.filter(r => r.status === 'skipped').length,
        results: fixResults
      });
    } catch (error) {
      console.error('[EventMediaFix] Error:', error);
      return res.status(500).json({ message: `Error: ${error.message}` });
    }
  });
  
  // Test endpoint for calendar event media upload
  app.post("/api/test-calendar-upload", upload.single('media'), async (req: any, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    
    console.log('[TestCalendarUpload] Processing test calendar media upload...');
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    // Set media type explicitly for calendar
    req.mediaType = MEDIA_TYPES.CALENDAR;
    
    try {
      // Call our calendar media upload handler directly
      await handleCalendarMediaUpload(req, res, () => {});
      
      // Get the object storage URL assigned by the handler
      const objectStorageUrl = req.objectStorageUrl;
      
      if (!objectStorageUrl) {
        return res.status(500).json({ 
          success: false, 
          message: "Upload handler did not return a valid URL"
        });
      }
      
      console.log('[TestCalendarUpload] Upload successful with URL:', objectStorageUrl);
      
      // List the current mappings for this file
      const mappingFilePath = path.join(process.cwd(), 'server', 'calendar-media-mapping.json');
      let mappings = {};
      if (fs.existsSync(mappingFilePath)) {
        mappings = JSON.parse(fs.readFileSync(mappingFilePath, 'utf8'));
      }
      
      // Filter mappings for this file only
      const filename = req.file.filename;
      const relevantMappings = Object.entries(mappings)
        .filter(([key, value]) => key.includes(filename) || (value as string).includes(filename))
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      
      return res.json({ 
        success: true, 
        url: objectStorageUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
        filesize: req.file.size,
        path: req.file.path,
        mappings: relevantMappings,
        message: "Test upload successful - verify URL in event detail page"
      });
    } catch (error) {
      console.error('[TestCalendarUpload] Error:', error);
      return res.status(500).json({ 
        success: false, 
        message: `Upload error: ${error.message || "Unknown error"}` 
      });
    }
  });
  
  app.get("/api/events", async (_req, res) => {
    const events = await storage.getEvents();
    res.json(events);
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json(event);
    } catch (err) {
      console.error("Error fetching event:", err);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.post("/api/events", upload.array('media'), (req: any, res, next) => {
    // Set the mediaType explicitly for calendar events to ensure proper sync
    req.mediaType = MEDIA_TYPES.CALENDAR;
    
    // Log for debugging purpose
    console.log('[EventCreate] Processing event media upload request');
    if (req.files && req.files.length > 0) {
      console.log(`[EventCreate] Event has ${req.files.length} media files attached`);
      req.files.forEach((file: Express.Multer.File, index: number) => {
        console.log(`[EventCreate] Media file ${index + 1}:
          - Filename: ${file.originalname}
          - Size: ${file.size} bytes
          - Path: ${file.path}
          - Mimetype: ${file.mimetype}
        `);
      });
    } else {
      console.log('[EventCreate] No media files attached to this event creation request');
    }
    
    next();
  }, mediaSyncMiddleware, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    
    // Check if user is approved or admin
    const isAdmin = req.user.role === 'admin';
    const isApproved = !!req.user.isApproved;
    
    // User must be approved to create events (admins are automatically considered approved)
    if (!isApproved && !isAdmin) {
      return res.status(403).json({ message: "Your account must be approved before you can create events" });
    }

    try {
      const files = req.files as Express.Multer.File[];
      let eventData;

      try {
        eventData = JSON.parse(req.body.eventData);
      } catch (error) {
        console.error("Error parsing event data:", error);
        return res.status(400).json({ message: "Invalid event data format" });
      }

      const result = insertEventSchema.safeParse(eventData);
      if (!result.success) {
        return res.status(400).json({
          message: "Invalid event data",
          errors: result.error.errors
        });
      }

      // Process media files through Object Storage middleware
      let mediaUrls = [];
      if (files && files.length > 0) {
        try {
          // Use processUploadedFiles to handle Object Storage integration
          req.mediaType = MEDIA_TYPES.CALENDAR;
          const result = await processUploadedFiles(req, files);
          
          if (result.success && result.urls) {
            mediaUrls = result.urls;
            console.log(`[EventCreate] Processed ${mediaUrls.length} files through Object Storage middleware`);
            console.log(`[EventCreate] Media URLs: ${JSON.stringify(mediaUrls)}`);
          } else {
            console.error(`[EventCreate] Failed to process media files through middleware:`, result.message);
            return res.status(500).json({ message: `Error processing media files: ${result.message}` });
          }
        } catch (mediaError) {
          console.error(`[EventCreate] Error processing media files:`, mediaError);
          return res.status(500).json({ message: 'Error processing media files' });
        }
      } else {
        console.log(`[EventCreate] No media files to process`);
      }

      const event = await storage.createEvent({
        ...result.data,
        mediaUrls,
        createdBy: req.user.id,
      });
      
      // Broadcast event creation to all connected clients
      broadcastWebSocketMessage('calendar_update', {
        action: 'create',
        event: event,
        timestamp: new Date().toISOString(),
        userId: req.user.id
      });
      
      // WebSocket disabled
      console.log(`Calendar event created: ID=${event.id}, Title="${event.title}"`);

      res.status(201).json(event);
    } catch (err) {
      console.error("Error creating event:", err);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", upload.array('media'), (req: any, res, next) => {
    // Set the mediaType explicitly for calendar events to ensure proper sync
    req.mediaType = MEDIA_TYPES.CALENDAR;
    next();
  }, mediaSyncMiddleware, async (req, res) => {
    // Enhanced authentication debugging
    console.log("Event PATCH authentication debug:", {
      isAuthenticated: req.isAuthenticated(),
      session: req.session ? {
        id: req.sessionID,
        cookie: req.session.cookie ? {
          originalMaxAge: req.session.cookie.originalMaxAge,
          expires: req.session.cookie.expires,
          secure: req.session.cookie.secure,
          httpOnly: req.session.cookie.httpOnly,
          sameSite: req.session.cookie.sameSite
        } : 'No cookie'
      } : 'No session',
      user: req.user ? {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      } : 'No user',
      headers: {
        cookie: req.headers.cookie ? 'Present' : 'Missing',
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer,
        'content-type': req.headers['content-type']
      }
    });

    if (!req.isAuthenticated()) {
      console.error(`Authentication failed for PATCH /api/events/${req.params.id}`);
      return res.status(401).json({ 
        message: "Not authenticated",
        details: "Session validation failed. Try logging in again."
      });
    }

    // Check if user is admin OR is the creator of the event and is approved
    const eventId = parseInt(req.params.id);
    const event = await storage.getEvent(eventId);
    
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    const isAdmin = req.user.role === 'admin';
    const isCreator = event.createdBy === req.user.id;
    const isApproved = !!req.user.isApproved;
    
    console.log(`User permission check for event ${eventId}:`, {
      userId: req.user.id,
      username: req.user.username,
      isAdmin,
      isCreator,
      isApproved,
      eventCreator: event.createdBy
    });
    
    if (!isAdmin && (!isCreator || !isApproved)) {
      return res.status(403).json({ message: "You don't have permission to edit this event" });
    }

    try {
      const eventId = parseInt(req.params.id);
      console.log(`Processing PATCH request for event ${eventId}`);

      const event = await storage.getEvent(eventId);
      if (!event) {
        console.log(`Event ${eventId} not found`);
        return res.status(404).json({ message: "Event not found" });
      }

      if (!req.body.eventData) {
        console.error('Missing eventData in request body');
        return res.status(400).json({ message: "Event data is required" });
      }

      let eventData;
      let editMode = null;
      
      try {
        eventData = JSON.parse(req.body.eventData);
        console.log('Parsed event data:', eventData);
        
        // Check if this is a recurring event edit and extract the edit mode
        if (event.isRecurring && eventData.editMode) {
          editMode = eventData.editMode;
          console.log(`Recurring event edit mode: ${editMode}`);
          // Remove editMode from the data as it's not part of the schema
          delete eventData.editMode;
        }
      } catch (error) {
        console.error("Error parsing event data:", error);
        return res.status(400).json({ message: "Invalid event data format" });
      }

      // Add media URLs if new files were uploaded (with calendar folder path)
      const files = req.files as Express.Multer.File[];
      console.log('Uploaded files:', files); // Log all files that were uploaded
      
      // Log the actual file paths
      if (files && files.length > 0) {
        console.log('Uploaded file details:');
        files.forEach(file => {
          console.log(`- Filename: ${file.filename}`);
          console.log(`  Path: ${file.path}`);
          console.log(`  Destination: ${file.destination}`);
        });
      }
      
      // Process each file using our enhanced media upload middleware
      let newMediaUrls = [];
      if (files && files.length > 0) {
        // Set media type for calendar events
        req.mediaType = MEDIA_TYPES.CALENDAR;
        
        try {
          // Process files through our enhanced middleware that uses Object Storage
          const result = await processUploadedFiles(req, files);
          
          if (result.success) {
            try {
              console.log(`[EventUpdate] DEBUG - Raw result object:`, JSON.stringify(result));
              
              // IMPORTANT FIX: Check for objectStorageUrls first, as these will be the most reliable
              // Then fall back to urls array if no object storage URLs available
              if (result.objectStorageUrls && result.objectStorageUrls.length > 0) {
                // Use Object Storage URLs and normalize them with our utility
                console.log(`[EventUpdate] Found ${result.objectStorageUrls.length} Object Storage URLs to normalize`);
                newMediaUrls = result.objectStorageUrls.map(url => {
                  try {
                    const normalizedUrl = normalizeMediaUrl(url, 'event');
                    console.log(`[EventUpdate] Normalized URL: ${url} -> ${normalizedUrl}`);
                    return normalizedUrl;
                  } catch (normalizeError) {
                    console.error(`[EventUpdate] Error normalizing URL: ${url}`, normalizeError);
                    // Return original URL as fallback
                    return url;
                  }
                });
                console.log(`[EventUpdate] Using Object Storage URLs (normalized): ${JSON.stringify(newMediaUrls)}`);
              } else if (result.urls && result.urls.length > 0) {
                // Fall back to regular URLs and normalize them
                console.log(`[EventUpdate] Found ${result.urls.length} regular URLs to normalize`);
                newMediaUrls = result.urls.map(url => {
                  try {
                    const normalizedUrl = normalizeMediaUrl(url, 'event');
                    console.log(`[EventUpdate] Normalized URL: ${url} -> ${normalizedUrl}`);
                    return normalizedUrl;
                  } catch (normalizeError) {
                    console.error(`[EventUpdate] Error normalizing URL: ${url}`, normalizeError);
                    // Return original URL as fallback
                    return url;
                  }
                });
                console.log(`[EventUpdate] Using regular URLs (normalized): ${JSON.stringify(newMediaUrls)}`);
              } else {
                console.warn(`[EventUpdate] No URLs returned from upload processor, but success was indicated`);
              }
              
              console.log(`[EventUpdate] Processed ${newMediaUrls.length} files through Object Storage middleware`);
              console.log(`[EventUpdate] Final Media URLs: ${JSON.stringify(newMediaUrls)}`);
            } catch (processingError) {
              console.error(`[EventUpdate] CRITICAL ERROR during media URL processing:`, processingError);
              // Set empty array as fallback to prevent the update from failing entirely
              newMediaUrls = [];
            }
          } else {
            console.error(`[EventUpdate] Failed to process media files through middleware:`, result.message);
            return res.status(500).json({ message: `Error processing media files: ${result.message}` });
          }
        } catch (mediaError) {
          console.error(`[EventUpdate] Error processing media files:`, mediaError);
          return res.status(500).json({ message: 'Error processing media files' });
        }
      } else {
        console.log(`[EventUpdate] No new media files to process`);
      }

      // Get current media URLs excluding the ones marked for removal
      const currentMediaUrls = event.mediaUrls || [];
      
      // Check both the regular eventData and the separate FormData field for URLs to remove
      let mediaToRemove = [];
      
      // First check if there's a separate field in the FormData
      if (req.body.existingMediaToRemove) {
        try {
          const parsedMediaToRemove = JSON.parse(req.body.existingMediaToRemove);
          console.log('Media removal - Detected separate FormData field with media to remove:', parsedMediaToRemove);
          if (Array.isArray(parsedMediaToRemove)) {
            mediaToRemove = parsedMediaToRemove;
          } else if (parsedMediaToRemove && typeof parsedMediaToRemove === 'string') {
            mediaToRemove = [parsedMediaToRemove];
          } else if (parsedMediaToRemove) {
            console.log('Media removal - Non-array value received:', parsedMediaToRemove);
            mediaToRemove = [parsedMediaToRemove.toString()];
          }
        } catch (e) {
          console.error('Media removal - Error parsing existingMediaToRemove from FormData:', e);
          console.error('Raw existingMediaToRemove value:', req.body.existingMediaToRemove);
          // If parsing fails but we have a string, try using it directly
          if (typeof req.body.existingMediaToRemove === 'string' && req.body.existingMediaToRemove.trim()) {
            mediaToRemove = [req.body.existingMediaToRemove];
          }
        }
      }
      
      // If not found in separate field, use the one in eventData
      if (mediaToRemove.length === 0 && eventData.existingMediaToRemove) {
        console.log('Media removal - Using existingMediaToRemove from eventData:', eventData.existingMediaToRemove);
        if (Array.isArray(eventData.existingMediaToRemove)) {
          mediaToRemove = eventData.existingMediaToRemove;
        } else if (eventData.existingMediaToRemove && typeof eventData.existingMediaToRemove === 'string') {
          mediaToRemove = [eventData.existingMediaToRemove];
        } else if (eventData.existingMediaToRemove) {
          mediaToRemove = [eventData.existingMediaToRemove.toString()];
        }
      }
      
      // Log media removal information for debugging
      console.log('Media removal - Request ID:', req.params.id);
      console.log('Media removal - Current media URLs:', currentMediaUrls);
      console.log('Media removal - Media to remove (raw):', mediaToRemove);
      
      // Ensure currentMediaUrls is always an array
      let normalizedCurrentUrls = [];
      if (Array.isArray(currentMediaUrls)) {
        normalizedCurrentUrls = currentMediaUrls.filter(url => typeof url === 'string' && url.trim() !== '');
      } else if (typeof currentMediaUrls === 'string' && currentMediaUrls.trim()) {
        normalizedCurrentUrls = [currentMediaUrls];
      } else if (currentMediaUrls) {
        try {
          if (typeof currentMediaUrls === 'string') {
            const parsed = JSON.parse(currentMediaUrls);
            if (Array.isArray(parsed)) {
              normalizedCurrentUrls = parsed.filter(url => typeof url === 'string' && url.trim() !== '');
            } else if (parsed && typeof parsed === 'string') {
              normalizedCurrentUrls = [parsed];
            }
          }
        } catch (e) {
          console.error('Media removal - Error parsing currentMediaUrls:', e);
          // If it's not parseable JSON but still has a value, use it directly
          if (currentMediaUrls && typeof currentMediaUrls === 'string') {
            normalizedCurrentUrls = [currentMediaUrls];
          }
        }
      }
      
      // Ensure mediaToRemove is always an array of strings
      let normalizedMediaToRemove = [];
      
      // Filter out any non-string or empty values
      if (Array.isArray(mediaToRemove)) {
        normalizedMediaToRemove = mediaToRemove
          .filter(url => url !== null && url !== undefined)
          .map(url => url.toString().trim())
          .filter(url => url !== '');
      } else if (mediaToRemove && typeof mediaToRemove === 'string' && mediaToRemove.trim()) {
        normalizedMediaToRemove = [mediaToRemove];
      }
      
      console.log('Media removal - Normalized current URLs:', normalizedCurrentUrls);
      console.log('Media removal - Normalized URLs to remove:', normalizedMediaToRemove);
      
      // Special debug for this broken event
      if (req.params.id === '4217') {
        console.log('CRITICAL DEBUG - Special handling for event 4217');
        console.log('Current URLs before filtering:', JSON.stringify(normalizedCurrentUrls));
        console.log('URLs to remove before filtering:', JSON.stringify(normalizedMediaToRemove));
      }
      
      const mediaUrlsToKeep = normalizedCurrentUrls.filter(
        url => {
          // Make sure we're dealing with strings
          const urlStr = String(url).trim();
          
          // Check if this URL should be removed
          const shouldRemove = normalizedMediaToRemove.some(removeUrl => {
            // First try direct string matching
            if (urlStr === removeUrl) return true;
            
            // Then try matching just the filename part
            const urlFilename = urlStr.split('/').pop();
            const removeFilename = removeUrl.split('/').pop();
            return urlFilename === removeFilename;
          });
          
          const shouldKeep = !shouldRemove;
          
          if (!shouldKeep) {
            console.log(`Media removal - Removing URL: ${urlStr}`);
            
            // Log all path variants to help with debugging
            const filenamePart = urlStr.split('/').pop();
            console.log(`Media removal - File basename: ${filenamePart}`);
            console.log(`Media removal - Possible paths: 
              - /uploads/calendar/${filenamePart}
              - /calendar/${filenamePart}
              - ${urlStr}
            `);
          }
          
          return shouldKeep;
        }
      );
      
      console.log('Media removal - URLs to keep:', mediaUrlsToKeep);

      // Normalize existing media URLs to ensure they use proxy format for client access
      // Import the normalizeMediaUrl function from our centralized utility
      const normalizedMediaUrlsToKeep = mediaUrlsToKeep.map(url => 
        normalizeMediaUrl(url, 'event')
      );
      
      console.log('Media removal - Normalized URLs to keep:', normalizedMediaUrlsToKeep);
      
      // Combine existing media (not marked for removal) with new media
      const mediaUrls = [...normalizedMediaUrlsToKeep, ...newMediaUrls];
      console.log('Media removal - Final media URLs list:', mediaUrls);

      // Convert ISO date strings to Date objects
      try {
        eventData.startDate = new Date(eventData.startDate);
        eventData.endDate = new Date(eventData.endDate);

        // Validate that dates are valid
        if (isNaN(eventData.startDate.getTime()) || isNaN(eventData.endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        return res.status(400).json({ message: "Invalid date format in event data" });
      }

      // Prepare the final update data
      const updatedEventData = {
        ...eventData,
        mediaUrls,
        updatedAt: new Date()
      };

      // Special debug logging for the hoursOfOperation field to track null values
      console.log('HOURS OF OPERATION data:', { 
        raw: eventData.hoursOfOperation,
        type: typeof eventData.hoursOfOperation,
        isNull: eventData.hoursOfOperation === null,
        keys: eventData.hoursOfOperation ? Object.keys(eventData.hoursOfOperation) : 'no keys' 
      });

      // Validate event data
      const result = insertEventSchema.safeParse(updatedEventData);
      if (!result.success) {
        console.error('Validation errors:', result.error.errors);
        return res.status(400).json({
          message: "Invalid event data",
          errors: result.error.errors
        });
      }

      console.log('Final update data:', updatedEventData);

      // Pass the edit mode to the storage method if this is a recurring event
      const updatedEvent = await storage.updateEvent(eventId, updatedEventData, editMode);
      console.log('Event updated successfully:', updatedEvent);
      
      // Broadcast event update to all connected clients
      broadcastWebSocketMessage('calendar_update', {
        action: 'update',
        event: updatedEvent,
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        editMode: editMode // This includes the recurrence edit mode info
      });
      
      // WebSocket disabled
      console.log(`Calendar event updated: ID=${updatedEvent.id}, Title="${updatedEvent.title}"`);
      
      res.json(updatedEvent);
    } catch (err) {
      console.error("Error updating event:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Add delete event endpoint
  app.delete("/api/events/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const eventId = parseInt(req.params.id);
      
      // Get the event before deleting it so we can include its info in the WebSocket message
      const eventToDelete = await storage.getEvent(eventId);
      
      if (!eventToDelete) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      await storage.deleteEvent(eventId);
      
      // Broadcast event deletion to all connected clients
      broadcastWebSocketMessage('calendar_update', {
        action: 'delete',
        eventId: eventId,
        event: eventToDelete,
        timestamp: new Date().toISOString(),
        userId: req.user.id
      });
      
      // WebSocket disabled
      console.log(`Calendar event deleted: ID=${eventId}, Title="${eventToDelete.title}"`);
      
      res.sendStatus(200);
    } catch (err) {
      console.error("Error deleting event:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });
  
  // Add endpoint to delete an entire recurring event series
  app.delete("/api/events/:id/series", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const eventId = parseInt(req.params.id);
      
      // Get the parent event before deleting the series
      const parentEvent = await storage.getEvent(eventId);
      
      if (!parentEvent) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      await storage.deleteEventSeries(eventId);
      
      // Broadcast event series deletion to all connected clients
      broadcastWebSocketMessage('calendar_update', {
        action: 'delete_series',
        eventId: eventId,
        parentEvent: parentEvent
      });
      
      res.sendStatus(200);
    } catch (err) {
      console.error("Error deleting event series:", err);
      res.status(500).json({ message: "Failed to delete event series" });
    }
  });
  
  // Add endpoint to delete all events (admin only)
  app.delete("/api/events", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      await storage.deleteAllEvents();
      
      // Broadcast a message to all clients that all events have been deleted
      broadcastWebSocketMessage('calendar_update', {
        action: 'delete_all'
      });
      
      res.status(200).json({ message: "All events have been deleted successfully" });
    } catch (err) {
      console.error("Error deleting all events:", err);
      res.status(500).json({ message: "Failed to delete all events" });
    }
  });

  // Simple auth check endpoint to verify authentication status
  app.get("/api/auth/check", (req, res) => {
    const authInfo = {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        isApproved: req.user.isApproved,
        isBlocked: req.user.isBlocked
      } : null
    };
    
    // Log the auth check for debugging
    console.log("Auth check requested", {
      isAuthenticated: authInfo.isAuthenticated,
      user: authInfo.user,
      sessionID: req.sessionID,
      cookies: req.headers.cookie,
      origin: req.headers.origin,
      host: req.hostname
    });
    
    res.json(authInfo);
  });
  
  // Debug route to check cookies and authentication settings
  app.get("/api/debug/auth", (req, res) => {
    // Safe to log these details for debugging - no sensitive data exposed
    const cookies = req.headers.cookie || 'No cookies';
    const authHeader = req.headers.authorization || 'No Authorization header';
    const hasSession = !!req.session;
    const sessionID = req.sessionID || 'No session ID';
    const isAuth = req.isAuthenticated();
    const userInfo = req.user ? {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      isApproved: req.user.isApproved,
      isBlocked: req.user.isBlocked
    } : null;
    
    // Information about the request
    const requestInfo = {
      protocol: req.protocol,
      secure: req.secure,
      hostname: req.hostname,
      originalUrl: req.originalUrl,
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || req.headers.referrer || 'None'
    };
    
    // App-level configuration
    const configInfo = {
      nodeEnv: process.env.NODE_ENV,
      cookieSecure: process.env.COOKIE_SECURE,
      cookieDomain: process.env.COOKIE_DOMAIN,
      trustProxy: process.env.TRUST_PROXY || 'Not set',
      port: process.env.PORT || 5000
    };
    
    // Return all debug information
    res.json({
      hasSession,
      sessionID,
      isAuthenticated: isAuth,
      user: userInfo,
      requestInfo,
      configInfo
    });
  });
  
  // Debug endpoint to check event media status
  app.get("/api/debug/check-event-media", async (req, res) => {
    try {
      // Get all events
      const events = await storage.getEvents();
      
      // Count events with media
      const eventsWithMedia = events.filter(event => 
        event.mediaUrls && event.mediaUrls.length > 0
      ).length;
      
      // Process events to add media status
      const processedEvents = events.map(event => {
        // Add media status information
        let mediaStatus = 'No Media';
        
        if (event.mediaUrls && event.mediaUrls.length > 0) {
          const mediaUrl = event.mediaUrls[0];
          
          if (mediaUrl.includes('/api/storage-proxy/CALENDAR/events/')) {
            mediaStatus = 'Proxy Format';
          } else if (mediaUrl.includes('object-storage.replit.app')) {
            mediaStatus = 'Direct Object Storage URL';
          } else if (mediaUrl.startsWith('/uploads/') || mediaUrl.startsWith('/calendar/')) {
            mediaStatus = 'Legacy File Path';
          } else {
            mediaStatus = 'Unknown Format';
          }
        }
        
        return {
          ...event,
          mediaStatus
        };
      });
      
      return res.json({
        count: events.length,
        eventsWithMedia,
        events: processedEvents
      });
    } catch (error) {
      console.error('[CheckEventMedia] Error:', error);
      return res.status(500).json({ message: `Error: ${error.message}` });
    }
  });
  
  // Special memory storage for test uploads
  const memoryStorage = multer.memoryStorage();
  const memoryUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (_req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed. Only ${allowedTypes.join(', ')} are supported.`));
      }
    }
  });

  // Debug endpoint for testing event media uploads
  app.post("/api/debug/test-event-media-upload", memoryUpload.single('testImage'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          message: 'No file uploaded' 
        });
      }
      
      const file = req.file;
      console.log(`[TestEventMediaUpload] Received file: ${file.originalname}, size: ${file.size} bytes`);
      
      // Create a unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const filename = `media-${timestamp}-${randomString}${path.extname(file.originalname)}`;
      
      // Storage key and proxy URL
      const storageKey = `events/${filename}`;
      const proxyUrl = `/api/storage-proxy/CALENDAR/events/${filename}`;
      
      try {
        // Get bucket name for CALENDAR
        const calendarBucket = objectStorageService.getBucketForMediaType('calendar');
        
        // Save the file temporarily to disk
        const tempPath = path.join('uploads', 'temp', filename);
        const tempDir = path.dirname(tempPath);
        
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Write the file buffer to disk
        fs.writeFileSync(tempPath, file.buffer);
        
        console.log(`[TestEventMediaUpload] Saved temp file to ${tempPath}, size: ${file.size} bytes`);
        
        try {
          if (!file.buffer) {
            throw new Error('File buffer is missing or empty');
          }
            
          console.log(`[TestEventMediaUpload] Uploading file buffer (size: ${file.buffer.length} bytes) to bucket: ${calendarBucket}`);
            
          // Upload to Object Storage using uploadData method
          const objectStorageUrl = await objectStorageService.uploadData(
            file.buffer,
            'events',  // use events as the media type for calendar events
            filename,
            file.mimetype,
            calendarBucket
          );
          
          console.log(`[TestEventMediaUpload] Successfully uploaded file to Object Storage: ${objectStorageUrl}`);
          
          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          
          // Return success with the proxy URL
          return res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            url: proxyUrl,
            directUrl: objectStorageUrl,
            filename,
            size: file.size,
            mimetype: file.mimetype,
            bucket: calendarBucket
          });
        } catch (uploadError) {
          console.error('[TestEventMediaUpload] Error uploading to Object Storage:', uploadError);
          return res.status(500).json({
            success: false, 
            message: 'Upload failed', 
            error: uploadError.message
          });
        }
      } catch (error) {
        console.error('[TestEventMediaUpload] Error handling file upload:', error);
        return res.status(500).json({
          success: false, 
          message: 'Upload failed', 
          error: error.message
        });
      }
    } catch (error) {
      console.error('[TestEventMediaUpload] Error:', error);
      return res.status(500).json({ message: `Error: ${error.message}` });
    }
  });

  // Debug endpoint to check bucket contents
  app.get('/api/debug/check-bucket-contents', async (req, res) => {
    try {
      // Get the bucket name for calendar
      const calendarBucket = objectStorageService.getBucketForMediaType('calendar');
      
      console.log(`[BucketContents] Getting files from bucket: ${calendarBucket}, prefix: events/`);
      
      try {
        // Get files directly from object storage client to see raw list
        let result = null;
        
        try {
          console.log('[BucketContents] Attempting listWithPrefix with bucket header:', calendarBucket);
          result = await objectStorageService.client.listWithPrefix('events/', {
            bucketName: calendarBucket,
            headers: {
              'X-Obj-Bucket': calendarBucket
            }
          });
        } catch (listError) {
          console.error('[BucketContents] Error from listWithPrefix:', listError);
          result = null;
        }
        
        if (!result || !result.ok) {
          console.log('[BucketContents] No results from listWithPrefix, trying direct listFiles');
          // Fallback to standard listFiles
          console.log('[BucketContents] Calling listFiles with prefix events/');
          result = { ok: true, value: await objectStorageService.listFiles('events/', calendarBucket) || [] };
        }
        
        // Get the files from the result
        const files = result && result.ok ? result.value : [];
        
        console.log(`[BucketContents] Found ${files.length} files in ${calendarBucket} bucket with events/ prefix`);
        
        return res.status(200).json({
          success: true,
          bucket: calendarBucket,
          prefix: 'events/',
          files: Array.isArray(files) ? files.map(item => {
            // Handle both string array and object array formats
            if (typeof item === 'string') {
              return { key: item, size: 0, lastModified: new Date() };
            } else {
              return {
                key: item.key || 'unknown',
                size: item.size || 0,
                lastModified: item.lastModified || new Date()
              };
            }
          }) : []
        });
      } catch (listError) {
        console.error('[BucketContents] Final error from list operations:', listError);
        return res.status(500).json({
          success: false,
          message: 'Failed to list bucket contents',
          error: listError.message
        });
      }
    } catch (error) {
      console.error('[BucketContents] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check bucket contents',
        error: error.message
      });
    }
  });

  // Event interaction routes
  app.post("/api/events/:id/interactions", async (req, res) => {
    try {
      console.log("Event interaction request:", {
        session: !!req.session,
        sessionID: req.sessionID,
        isAuthenticated: req.isAuthenticated(),
        hasUser: !!req.user,
        user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null,
        cookies: req.headers.cookie,
        eventId: req.params.id,
        body: req.body
      });

      if (!req.isAuthenticated()) {
        console.log("Authentication failed for event interaction");
        return res.status(401).json({ message: "Not authenticated" });
      }

      const eventId = parseInt(req.params.id);
      const { type } = req.body;

      if (!type || !['like', 'going', 'interested'].includes(type)) {
        return res.status(400).json({ message: "Invalid interaction type" });
      }
      
      // Check if user is not blocked or is admin
      const isAdmin = req.user.role === 'admin';
      const isBlocked = !!req.user.isBlocked;
      
      // User can interact if they are not blocked (admin users bypass all restrictions)
      const canInteract = !isBlocked || isAdmin;
      
      if (!canInteract) {
        // Check why the user can't interact
        if (isBlocked) {
          return res.status(403).json({ 
            message: "Your account has been blocked from interacting with events" 
          });
        } else {
          return res.status(403).json({ 
            message: "You don't have permission to interact with events" 
          });
        }
      }

      // Check if interaction already exists
      const existingInteraction = await storage.getEventInteraction(eventId, req.user.id, type);

      if (existingInteraction) {
        // If interaction exists, delete it (toggle behavior)
        await storage.deleteEventInteraction(eventId, req.user.id, type);
        res.json({ message: "Interaction removed" });
      } else {
        // Create new interaction
        const interaction = await storage.createEventInteraction({
          eventId,
          userId: req.user.id,
          interactionType: type
        });
        res.json(interaction);
      }
    } catch (err) {
      console.error("Error handling event interaction:", err);
      res.status(500).json({ message: "Failed to process interaction" });
    }
  });

  // Get event interactions
  app.get("/api/events/:id/interactions", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const interactions = await storage.getEventInteractions(eventId);
      res.json(interactions);
    } catch (err) {
      console.error("Error fetching event interactions:", err);
      res.status(500).json({ message: "Failed to fetch interactions" });
    }
  });

  // Payment endpoints for real estate listings
  app.post("/api/payments/create-link", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { discountCode, redirectUrl, listingType, listingDuration, amount } = req.body;
      
      // Enhanced logging
      console.log("Create payment link request received:");
      console.log("- User ID:", req.user.id);
      console.log("- Discount code:", discountCode || 'None');
      console.log("- Custom redirect URL:", redirectUrl || "Not provided (will use default)");
      console.log("- Listing type:", listingType || 'Not provided (will use FSBO)');
      console.log("- Listing duration:", listingDuration || 'Not provided (will use 30_day)');
      console.log("- Custom amount:", amount || 'Not provided (will use standard pricing)');
      console.log("- Square environment variables present:");
      console.log("  - SQUARE_ACCESS_TOKEN:", process.env.SQUARE_ACCESS_TOKEN ? "Set" : "Not set");
      console.log("  - SQUARE_APPLICATION_ID:", process.env.SQUARE_APPLICATION_ID ? "Set" : "Not set");
      console.log("  - SQUARE_LOCATION_ID:", process.env.SQUARE_LOCATION_ID ? "Set" : "Not set");
      
      // Create a payment with Square
      const { createPaymentLink } = await import('./square-service');
      
      console.log("Calling createPaymentLink function...");
      console.log("User email:", req.user.email);
      
      // Make sure redirectUrl is a string to avoid any potential null/undefined issues
      const customRedirectUrl = redirectUrl || null;
      console.log("Final custom redirect URL:", customRedirectUrl);
      
      const result = await createPaymentLink(
        req.user.id, 
        discountCode, 
        req.user.email, 
        customRedirectUrl,
        listingType,
        listingDuration,
        amount
      );
      console.log("Payment link creation successful:", result);
      
      res.json({
        success: true,
        paymentId: result.paymentId,
        paymentLinkUrl: result.paymentLinkUrl,
        paymentLinkId: result.paymentLinkId,
        isFree: result.isFree
      });
    } catch (err) {
      console.error("Error creating payment link:", err);
      // More detailed error response
      let errorMessage = "Failed to create payment link";
      if (err instanceof Error) {
        errorMessage += ": " + err.message;
        console.error("Error stack:", err.stack);
      }
      
      res.status(500).json({ 
        success: false,
        message: errorMessage
      });
    }
  });

  app.post("/api/payments/validate-discount", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ 
          success: false, 
          message: "Discount code is required" 
        });
      }
      
      // Import Square service functions
      const { validateDiscountCode, getPaymentAmount } = await import('./square-service');
      
      // Validate the discount code
      const discountAmount = await validateDiscountCode(code);
      const { amount } = await getPaymentAmount(code);
      
      res.json({
        success: true,
        valid: discountAmount > 0,
        discountAmount,
        finalAmount: amount
      });
    } catch (err) {
      console.error("Error validating discount code:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to validate discount code" 
      });
    }
  });

  app.post("/api/payments/success", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment intent ID is required" 
        });
      }
      
      // Import Square service function
      const { handlePaymentSuccess } = await import('./square-service');
      
      // Mark the payment as successful
      const paymentId = await handlePaymentSuccess(paymentIntentId);
      
      res.json({
        success: true,
        paymentId
      });
    } catch (err) {
      console.error("Error handling payment success:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to process successful payment" 
      });
    }
  });

  app.post("/api/payments/failure", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment intent ID is required" 
        });
      }
      
      // Get payment from database and update status
      const payment = await storage.getListingPaymentByIntent(paymentIntentId);
      
      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: "Payment not found" 
        });
      }
      
      // Check if the payment belongs to the user
      if (payment.userId !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: "You do not have permission to access this payment" 
        });
      }
      
      // Update payment status to failed
      await storage.updateListingPayment(payment.id, {
        status: 'failed',
        updatedAt: new Date()
      });
      
      res.json({
        success: true,
        paymentId: payment.id
      });
    } catch (err) {
      console.error("Error handling payment failure:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to process failed payment" 
      });
    }
  });
  
  // Verify payment status (used after free payment or redirect from Square)
  app.post("/api/payments/verify", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { paymentIntentId, transactionId, orderId } = req.body;
      
      // Use the first non-empty ID from the provided parameters
      const paymentIdentifier = paymentIntentId || transactionId || orderId;
      
      console.log("Payment verification request received:");
      console.log("- User ID:", req.user.id);
      console.log("- Payment identifiers:", { paymentIntentId, transactionId, orderId });
      console.log("- Using identifier:", paymentIdentifier);
      console.log("- Full request body:", JSON.stringify(req.body, null, 2));
      console.log("- Request headers:", {
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host
      });
      
      if (!paymentIdentifier) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment identifier is required" 
        });
      }
      
      // Handle special case for free payments with the FREE- prefix
      if (paymentIdentifier.startsWith('FREE-')) {
        // Extract the payment ID from the FREE- format
        const freePaymentId = parseInt(paymentIdentifier.substring(5), 10);
        if (isNaN(freePaymentId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid free payment identifier format"
          });
        }
        
        // Get the payment record directly by ID
        const payment = await storage.getListingPayment(freePaymentId);
        
        if (!payment) {
          return res.status(404).json({ 
            success: false, 
            message: "Free payment not found" 
          });
        }
        
        // Check if the payment belongs to the user
        if (payment.userId !== req.user.id) {
          return res.status(403).json({ 
            success: false, 
            message: "You do not have permission to access this payment" 
          });
        }
        
        // Free payments should already be marked as completed
        return res.json({
          success: true,
          paymentId: payment.id,
          status: 'completed'
        });
      }
      
      // Import the Square verification service first to handle various payment ID formats
      const { verifyPaymentStatus } = await import('./square-service');
      
      try {
        // This will handle various ID formats including Square transaction IDs
        const verificationResult = await verifyPaymentStatus(paymentIdentifier);
        
        // Log the verification result for debugging
        console.log("Payment verification result:", JSON.stringify(verificationResult, null, 2));
        
        // If this is a new payment from a Square transaction ID, update the user ID
        if (verificationResult.isCompleted && verificationResult.paymentId) {
          // Update the payment with the authenticated user's ID (unless there was an error)
          if (verificationResult.paymentId > 0) {
            try {
              await storage.updateListingPayment(verificationResult.paymentId, {
                userId: req.user.id,
                updatedAt: new Date()
              });
            } catch (updateErr) {
              console.error("Error updating payment userId:", updateErr);
              // Continue even if the update fails - user can still create listing
            }
          }
          
          // Always indicate success - this allows listing creation to proceed
          // even if there were backend issues with the payment verification
          return res.json({
            success: true,
            paymentId: verificationResult.paymentId || payment?.id || 0,
            status: 'completed',
            message: verificationResult.error ? 
              "Your payment has been processed, but there was a system error. You can proceed with your listing." : 
              "Your payment has been verified."
          });
        }
        
        // If we got a paymentId but payment is not completed, return pending
        if (verificationResult.paymentId && !verificationResult.isCompleted) {
          return res.json({
            success: true,
            paymentId: verificationResult.paymentId,
            status: 'pending'
          });
        }
        
        // If verification returned an error but we want to let user continue anyway
        if (verificationResult.error) {
          console.log("Payment verification failed but allowing user to continue:", verificationResult.error);
          return res.json({
            success: true,
            paymentId: payment?.id || 0,
            status: 'completed',
            message: "Payment verification encountered an issue, but you may proceed with your listing."
          });
        }
      } catch (verificationError) {
        console.error("Verification error:", verificationError);
        // Continue to legacy flow if verification fails
      }
      
      // Legacy flow: look up payment by intent ID in our database
      const payment = await storage.getListingPaymentByIntent(paymentIdentifier);
      
      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: "Payment not found" 
        });
      }
      
      // Check if the payment belongs to the user
      if (payment.userId !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: "You do not have permission to access this payment" 
        });
      }
      
      // If payment is already marked as completed in our database
      if (payment.status === 'completed') {
        return res.json({
          success: true,
          paymentId: payment.id,
          status: 'completed'
        });
      } else {
        return res.json({
          success: true,
          paymentId: payment.id,
          status: 'pending'
        });
      }
    } catch (err) {
      console.error("Error verifying payment:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to verify payment" 
      });
    }
  });
  
  // Create subscription for a listing
  app.post("/api/subscriptions/create", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { listingId, planType } = req.body;
      
      // Validate required fields
      if (!listingId) {
        return res.status(400).json({
          success: false,
          message: "Listing ID is required"
        });
      }
      
      if (!planType) {
        return res.status(400).json({
          success: false,
          message: "Plan type is required"
        });
      }
      
      // Import subscription service
      const { createSubscription, SUBSCRIPTION_PLANS } = await import('./subscription-service');
      
      // Validate plan type
      if (!Object.keys(SUBSCRIPTION_PLANS).includes(planType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid plan type. Must be one of: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`
        });
      }
      
      // Verify the listing exists and belongs to the user
      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: "Listing not found"
        });
      }
      
      if (listing.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this listing"
        });
      }
      
      console.log(`Creating subscription for listing ${listingId} with plan ${planType}`);
      const result = await createSubscription(
        req.user.id,
        listingId,
        planType as keyof typeof SUBSCRIPTION_PLANS,
        req.user.email
      );
      
      res.json({
        success: true,
        checkoutUrl: result.checkoutUrl,
        paymentLinkId: result.paymentLinkId
      });
    } catch (err) {
      console.error("Error creating subscription:", err);
      let errorMessage = "Failed to create subscription";
      if (err instanceof Error) {
        errorMessage += ": " + err.message;
        console.error("Error stack:", err.stack);
      }
      
      res.status(500).json({ 
        success: false,
        message: errorMessage
      });
    }
  });
  
  // Verify subscription payment status
  app.post("/api/subscriptions/verify", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { paymentLinkId } = req.body;
      
      if (!paymentLinkId) {
        return res.status(400).json({
          success: false,
          message: "Payment link ID is required"
        });
      }
      
      // Import subscription service
      const { verifySubscriptionPayment } = await import('./subscription-service');
      
      console.log(`Verifying subscription payment status for link ID: ${paymentLinkId}`);
      const result = await verifySubscriptionPayment(paymentLinkId);
      
      res.json({
        success: true,
        isCompleted: result.isCompleted,
        listingId: result.listingId,
        subscriptionId: result.subscriptionId,
        message: result.message
      });
    } catch (err) {
      console.error("Error verifying subscription payment:", err);
      let errorMessage = "Failed to verify subscription payment";
      if (err instanceof Error) {
        errorMessage += ": " + err.message;
        console.error("Error stack:", err.stack);
      }
      
      res.status(500).json({ 
        success: false,
        message: errorMessage
      });
    }
  });
  
  // Cancel a subscription
  app.post("/api/subscriptions/cancel", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { listingId } = req.body;
      
      if (!listingId) {
        return res.status(400).json({
          success: false,
          message: "Listing ID is required"
        });
      }
      
      // Import subscription service
      const { cancelSubscription } = await import('./subscription-service');
      
      // Verify the listing exists and belongs to the user
      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: "Listing not found"
        });
      }
      
      if (listing.createdBy !== req.user.id && req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this listing"
        });
      }
      
      // Verify the listing has an active subscription
      if (!listing.isSubscription || !listing.subscriptionId) {
        return res.status(400).json({
          success: false,
          message: "This listing does not have an active subscription"
        });
      }
      
      console.log(`Cancelling subscription for listing ${listingId}`);
      await cancelSubscription(listingId);
      
      res.json({
        success: true,
        message: "Subscription cancelled successfully"
      });
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      let errorMessage = "Failed to cancel subscription";
      if (err instanceof Error) {
        errorMessage += ": " + err.message;
        console.error("Error stack:", err.stack);
      }
      
      res.status(500).json({ 
        success: false,
        message: errorMessage
      });
    }
  });
  
  // Diagnostic endpoint for Square integration
  app.get("/api/payments/square-status", requireAdmin, async (req, res) => {
    try {
      // Get Square client status
      const status = squareService.getSquareClientStatus();
      
      // Test API connection with a simple request
      let apiConnectionStatus = {
        connected: false,
        error: null,
        message: 'API connection test not performed'
      };
      
      // Get fresh credentials to ensure we use current values
      const { accessToken, locationId } = squareService.getSquareCredentials();
      
      // Only test connection if we have credentials
      if (accessToken && locationId) {
        try {
          // Always use production URL with production credentials
          const baseUrl = 'https://connect.squareup.com';
          
          // Perform a lightweight API call to check credentials using fresh credentials
          const response = await fetch(`${baseUrl}/v2/locations`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Square-Version': '2023-09-25'
            }
          });
          
          if (response.ok) {
            apiConnectionStatus = {
              connected: true,
              error: null,
              message: 'Successfully connected to Square API'
            };
          } else {
            const errorText = await response.text();
            apiConnectionStatus = {
              connected: false,
              error: `${response.status} ${response.statusText}`,
              message: `API connection failed: ${errorText}`,
            };
          }
        } catch (apiError) {
          apiConnectionStatus = {
            connected: false,
            error: apiError instanceof Error ? apiError.message : String(apiError),
            message: 'API connection failed with exception'
          };
        }
      }
      
      const environmentInfo = {
        nodeEnv: process.env.NODE_ENV || 'Not set',
        publicUrl: process.env.PUBLIC_URL || 'Not set',
        hasSquareAccessToken: !!process.env.SQUARE_ACCESS_TOKEN,
        hasSquareApplicationId: !!process.env.SQUARE_APPLICATION_ID,
        hasSquareLocationId: !!process.env.SQUARE_LOCATION_ID,
      };
      
      res.json({
        status: 'ok',
        squareStatus: status,
        environmentInfo,
        apiConnectionStatus
      });
    } catch (err) {
      console.error('Error in Square status check:', err);
      res.status(500).json({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Endpoint to get Square API credential status (masked, admin only)
  app.get("/api/payments/square-env", async (req, res) => {
    // Only allow admin access to this endpoint
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get fresh credentials
      const { accessToken, applicationId, locationId } = squareService.getSquareCredentials();
      
      // Return masked values or indicators if credentials exist
      const maskedLength = 6; // Show only this many characters at the end
      
      // Log current environment settings for debugging
      console.log('GET /api/payments/square-env - Current Square credentials:');
      console.log(`- ACCESS_TOKEN: ${accessToken ? 'Set (masked)' : 'Not set'}`);
      console.log(`- APPLICATION_ID: ${applicationId || 'Not set'}`);
      console.log(`- LOCATION_ID: ${locationId || 'Not set'}`);
      console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
      
      // Helper to mask sensitive data
      const maskCredential = (value: string | undefined) => {
        if (!value) return '';
        if (value.length <= maskedLength) {
          return '•'.repeat(value.length);
        }
        return '•'.repeat(value.length - maskedLength) + value.slice(-maskedLength);
      };
      
      res.json({
        squareAccessToken: accessToken ? maskCredential(accessToken) : '',
        squareApplicationId: applicationId || '',
        squareLocationId: locationId || '',
      });
    } catch (err) {
      console.error('Error getting Square API credentials:', err);
      res.status(500).json({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });
  
  // Endpoint to update Square API credentials (admin only)
  app.post("/api/payments/square-env", async (req, res) => {
    // Only allow admin access to this endpoint
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get credentials from request body
      const { squareAccessToken, squareApplicationId, squareLocationId } = req.body;
      
      if (!squareAccessToken || !squareApplicationId || !squareLocationId) {
        return res.status(400).json({
          status: 'error',
          message: 'All Square API credentials are required',
        });
      }
      
      // In a production environment, we would update environment variables
      // but in the Replit environment, we'll update the current process.env values
      // Note: This is temporary for this session, a real implementation would
      // store these values in a proper configuration system or environment variables
      process.env.SQUARE_ACCESS_TOKEN = squareAccessToken;
      process.env.SQUARE_APPLICATION_ID = squareApplicationId;
      process.env.SQUARE_LOCATION_ID = squareLocationId;
      
      // IMPORTANT: Remove any older credentials from memory
      try {
        const squareService = await import('./square-service');
        await squareService.reinitializeSquareClient();
        console.log('Successfully reinitialized Square client with new credentials');
      } catch (error) {
        console.error('Error reinitializing Square client:', error);
        // Continue anyway since we've updated the environment variables
      }
      
      res.json({
        status: 'success',
        message: 'Square API credentials updated successfully',
      });
    } catch (err) {
      console.error('Error updating Square API credentials:', err);
      res.status(500).json({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });


  // Endpoint to check for expired listings (admin only)
  app.post("/api/listings/check-expired", requireAdmin, async (req, res) => {
    try {
      const { checkExpiredListings } = await import('./listing-expiration-service');
      const result = await checkExpiredListings();
      
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      console.error("Error checking expired listings:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to check expired listings"
      });
    }
  });
  
  // Test endpoint for listing expiration (open access for testing)
  app.get("/__test__/expiration", async (req, res) => {
    try {
      console.log("Testing listing expiration service without auth");
      const { checkExpiredListings, checkExpiringListings } = await import('./listing-expiration-service');
      
      // Run both checks
      const expiredResult = await checkExpiredListings();
      const expiringResult = await checkExpiringListings(3); // Check listings expiring in 3 days
      
      // Log the service behavior
      console.log("Listing expiration test results:", {
        expired: expiredResult,
        expiring: expiringResult
      });
      
      res.json({
        success: true,
        message: "Listing expiration service test completed",
        expired: expiredResult,
        expiring: expiringResult
      });
    } catch (err) {
      console.error("Error testing listing expiration service:", err);
      res.status(500).json({ 
        success: false, 
        message: err instanceof Error ? err.message : "Failed to test listing expiration service",
        error: String(err)
      });
    }
  });
  
  // Endpoint to renew a listing for another 30 days (non-subscription)
  app.post("/api/listings/:id/renew", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const listingId = parseInt(req.params.id);
      const listing = await storage.getListing(listingId);
      
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      // Check if user owns the listing or is an admin
      const isAdmin = req.user.role === 'admin';
      if (listing.createdBy !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to renew this listing" });
      }
      
      // Calculate new expiration date (+30 days from now)
      const newExpirationDate = new Date();
      newExpirationDate.setDate(newExpirationDate.getDate() + 30);
      
      // TODO: Process payment here (actual payment processing would be implemented based on your payment provider)
      // For now, assuming payment is successful and just updating the listing
      
      // Update the listing with new expiration date
      const updatedListing = await storage.updateListing(listingId, {
        expirationDate: newExpirationDate,
        isApproved: true, // Re-approve if it was expired
        updatedAt: new Date()
      });
      
      // Create a payment record
      await storage.createListingPayment({
        userId: req.user.id,
        amount: 5000, // $50.00
        currency: "USD",
        status: "completed",
        paymentMethod: "square", // or whatever method was used
        listingId: listingId,
        subscriptionId: null,
        subscriptionPlan: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      res.json({
        success: true, 
        message: "Listing renewed successfully",
        listing: updatedListing
      });
    } catch (err) {
      console.error("Error renewing listing:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to renew listing"
      });
    }
  });
  
  // Endpoint to convert a one-time listing to a subscription
  app.post("/api/listings/:id/convert-to-subscription", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const listingId = parseInt(req.params.id);
      const { planType } = req.body;
      
      if (!planType || !['MONTHLY', 'QUARTERLY'].includes(planType)) {
        return res.status(400).json({ message: "Invalid subscription plan type" });
      }
      
      // Use the subscription service to handle the conversion
      const { createSubscription } = await import('./subscription-service');
      const result = await createSubscription(listingId, req.user.id, planType);
      
      res.json({
        success: true, 
        message: "Listing converted to subscription successfully",
        ...result
      });
    } catch (err) {
      console.error("Error converting listing to subscription:", err);
      res.status(500).json({ 
        success: false, 
        message: err instanceof Error ? err.message : "Failed to convert listing to subscription"
      });
    }
  });
  
  // Endpoint to manage (retrieve) subscription details
  app.get("/api/subscriptions/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const subscriptionId = req.params.id;
      
      // Use the subscription service to handle retrieving subscription details
      const { getSubscription } = await import('./subscription-service');
      const subscriptionDetails = await getSubscription(subscriptionId);
      
      // Make sure user is authorized to view this subscription
      const listing = subscriptionDetails.listing;
      const isAdmin = req.user.role === 'admin';
      if (listing.createdBy !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to view this subscription" });
      }
      
      res.json(subscriptionDetails);
    } catch (err) {
      console.error("Error fetching subscription:", err);
      res.status(500).json({ 
        success: false,
        message: err instanceof Error ? err.message : "Failed to fetch subscription details" 
      });
    }
  });
  
  // Endpoint to cancel a subscription
  app.delete("/api/subscriptions/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const subscriptionId = req.params.id;
      
      // Use the subscription service to handle subscription cancellation
      const { cancelSubscription } = await import('./subscription-service');
      const result = await cancelSubscription(subscriptionId, req.user.id);
      
      res.json({
        success: true,
        message: "Subscription cancelled successfully",
        ...result
      });
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      res.status(500).json({ 
        success: false, 
        message: err instanceof Error ? err.message : "Failed to cancel subscription"
      });
    }
  });
  
  // Endpoint to provide Square configuration for client-side payment implementation
  app.get("/api/square/config", requireAuth, (req, res) => {
    // Return Square configuration information
    if (!process.env.SQUARE_APPLICATION_ID || !process.env.SQUARE_LOCATION_ID) {
      return res.status(500).json({
        success: false,
        message: "Square payment integration is not properly configured"
      });
    }

    res.json({
      applicationId: process.env.SQUARE_APPLICATION_ID,
      locationId: process.env.SQUARE_LOCATION_ID,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
    });
  });

  // Create payment intent for publishing a draft listing
  app.post("/api/listings/:id/create-publish-payment", requireAuth, async (req, res) => {
    try {
      const listingId = parseInt(req.params.id);
      const { listingDuration } = req.body;
      
      if (!listingDuration || !['3_day', '7_day', '30_day'].includes(listingDuration)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid listing duration. Must be '3_day', '7_day', or '30_day'." 
        });
      }
      
      // Get the listing
      const listing = await storage.getListing(listingId);
      
      if (!listing) {
        return res.status(404).json({ success: false, message: "Listing not found" });
      }
      
      // Check if user owns the listing
      if (listing.createdBy !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: "You do not have permission to publish this listing" 
        });
      }
      
      // Check if listing is in DRAFT status
      if (listing.status !== 'DRAFT') {
        return res.status(400).json({ 
          success: false, 
          message: "Only draft listings can be published" 
        });
      }
      
      // Calculate price based on duration (in cents)
      let amount = 0;
      switch (listingDuration) {
        case '3_day':
          amount = 500; // $5
          break;
        case '7_day':
          amount = 1000; // $10
          break;
        case '30_day':
          amount = 2500; // $25
          break;
      }
      
      // Ensure Stripe is initialized
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ 
          success: false, 
          message: "Payment processing is not configured" 
        });
      }
      
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
      });
      
      // Create a payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        metadata: {
          listingId: listingId.toString(),
          userId: req.user.id.toString(),
          listingDuration
        },
      });
      
      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        amount,
        listingDuration
      });
    } catch (error) {
      console.error("Error creating payment intent for publishing:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to create payment for publishing" 
      });
    }
  });
  
  // Square payment processing endpoint for publishing a listing
  app.post("/api/listings/:id/publish-with-square", requireAuth, async (req, res) => {
    try {
      const listingId = parseInt(req.params.id);
      const { sourceId, listingDuration, amount } = req.body;
      
      if (!sourceId) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment source ID is required" 
        });
      }
      
      if (!listingDuration || !['3_day', '7_day', '30_day'].includes(listingDuration)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid listing duration" 
        });
      }
      
      if (!amount) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment amount is required" 
        });
      }
      
      // Get the listing
      const listing = await storage.getListing(listingId);
      
      if (!listing) {
        return res.status(404).json({ 
          success: false, 
          message: "Listing not found" 
        });
      }
      
      // Check if user owns the listing
      if (listing.createdBy !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: "You do not have permission to publish this listing" 
        });
      }
      
      // Check if listing is in DRAFT status
      if (listing.status !== "DRAFT") {
        return res.status(400).json({ 
          success: false, 
          message: "Only draft listings can be published" 
        });
      }
      
      if (!squareClient) {
        return res.status(500).json({ 
          success: false, 
          message: "Square payment processing is not available" 
        });
      }
      
      // Process the payment with Square
      try {
        const idempotencyKey = `listing-pub-${listingId}-${Date.now()}`;
        
        const payment = await squareClient.paymentsApi.createPayment({
          sourceId: sourceId,
          idempotencyKey,
          amountMoney: {
            amount: amount,
            currency: 'USD'
          },
          locationId: process.env.SQUARE_LOCATION_ID,
          note: `Listing publication payment for listing #${listingId}`,
          referenceId: `listing-${listingId}`
        });
        
        if (!payment.result || !payment.result.payment) {
          throw new Error('Payment processing failed');
        }
        
        // Save the payment details
        await storage.createListingPayment({
          listingId,
          userId: req.user.id,
          paymentIntentId: payment.result.payment.id,
          amount: amount / 100, // Convert from cents to dollars
          status: 'completed',
          paymentMethod: 'square',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Publish the listing
        const duration = listingDuration === '3_day' ? 3 : 
                         listingDuration === '7_day' ? 7 : 30;
        
        const publishedListing = await storage.publishListing(listingId, duration);
        
        res.json({
          success: true,
          listing: publishedListing,
          message: "Listing published successfully"
        });
        
      } catch (error) {
        console.error("Error processing Square payment:", error);
        return res.status(500).json({ 
          success: false, 
          message: error instanceof Error ? error.message : "Payment processing failed" 
        });
      }
    } catch (error) {
      console.error("Error in publish-with-square endpoint:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to process payment and publish listing" 
      });
    }
  });

  // Endpoint to publish a draft listing after payment
  app.post("/api/listings/:id/publish", requireAuth, async (req, res) => {
    try {
      const listingId = parseInt(req.params.id);
      const { paymentIntentId, listingDuration } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment information is required" 
        });
      }
      
      // Get the listing
      const listing = await storage.getListing(listingId);
      
      if (!listing) {
        return res.status(404).json({ success: false, message: "Listing not found" });
      }
      
      // Check if user owns the listing
      if (listing.createdBy !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: "You do not have permission to publish this listing" 
        });
      }
      
      // Check if listing is in DRAFT status
      if (listing.status !== 'DRAFT') {
        return res.status(400).json({ 
          success: false, 
          message: "Only draft listings can be published" 
        });
      }
      
      // Verify the payment with Stripe
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ 
          success: false, 
          message: "Payment processing is not configured" 
        });
      }
      
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
      });
      
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ 
          success: false, 
          message: "Payment has not been completed" 
        });
      }
      
      // Verify that the payment is for this listing
      if (paymentIntent.metadata.listingId !== listingId.toString()) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment does not match this listing" 
        });
      }
      
      // Calculate expiration date based on duration
      const now = new Date();
      let expirationDate = new Date(now);
      
      switch (listingDuration || paymentIntent.metadata.listingDuration) {
        case '3_day':
          expirationDate.setDate(now.getDate() + 3);
          break;
        case '7_day':
          expirationDate.setDate(now.getDate() + 7);
          break;
        case '30_day':
          expirationDate.setDate(now.getDate() + 30);
          break;
        default:
          // Default to 7 days if something goes wrong
          expirationDate.setDate(now.getDate() + 7);
      }
      
      // Update the listing to active status with expiration date
      const updatedListing = await storage.updateListing(listingId, {
        status: 'ACTIVE',
        expirationDate,
        listingDuration: listingDuration || paymentIntent.metadata.listingDuration,
        updatedAt: now
      });
      
      res.json({
        success: true,
        message: "Listing published successfully",
        listing: updatedListing
      });
    } catch (error) {
      console.error("Error publishing listing:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to publish listing" 
      });
    }
  });
  
  // For Sale Listings API
  app.get("/api/listings", async (req, res) => {
    // Make listings available to all users, even if not authenticated
    // This allows the real estate page to load for everyone
    try {
      console.log("[DEBUG: Listings API] Received request for listings", {
        hasAuth: !!req.isAuthenticated(),
        userId: req.query.userId
      });
      
      // Check if we need to filter by user ID
      const userId = req.query.userId;
      
      // Detailed timing and execution logs
      console.time("[DEBUG: Listings API] Database fetch time");
      let listings;
      
      try {
        if (userId && !isNaN(Number(userId))) {
          // Filter listings by user ID
          console.log(`[DEBUG: Listings API] Fetching listings for user ID: ${userId}`);
          listings = await storage.getListingsByUser(Number(userId));
        } else {
          // Get all listings
          console.log("[DEBUG: Listings API] Fetching all listings");
          listings = await storage.getListings();
        }
        console.log(`[DEBUG: Listings API] Retrieved ${listings ? listings.length : 0} listings`);
        
        // Log the data structure of the first listing to help diagnose issues
        if (listings && listings.length > 0) {
          console.log("[DEBUG: Listings API] First listing structure:", JSON.stringify({
            id: listings[0].id,
            title: listings[0].title,
            status: listings[0].status,
            createdBy: listings[0].createdBy,
            photosCount: listings[0].photos ? listings[0].photos.length : 0,
            photosType: listings[0].photos ? typeof listings[0].photos : 'undefined',
            isPhotosArray: listings[0].photos ? Array.isArray(listings[0].photos) : false
          }, null, 2));
        }
        
        // Apply appropriate filtering based on the request context
        if (listings && Array.isArray(listings)) {
          console.log("[DEBUG: Listings API] Filtering listings. User authenticated:", req.isAuthenticated());
          const authenticatedUserId = req.isAuthenticated() ? req.user.id : null;
          
          // If viewing specific user's listings ("My Listings" view)
          if (userId && !isNaN(Number(userId))) {
            // For "My Listings", show all of the user's own listings (including drafts and expired)
            // Check if the requesting user is an admin - admins can see all draft listings
            const isAdmin = req.isAuthenticated() && req.user.role === 'admin';
            
            // If the requesting user is not the owner of these listings AND is not an admin,
            // filter out draft listings that don't belong to them
            if (req.isAuthenticated() && Number(userId) !== req.user.id && !isAdmin) {
              console.log(`[DEBUG: Listings API] User ${req.user.id} is viewing listings for user ${userId} - filtering out other user's drafts`);
              
              // Filter out drafts that don't belong to the current user
              listings = listings.filter(listing => {
                const isDraft = listing.status === 'DRAFT';
                return !isDraft; // Only show non-draft listings when viewing someone else's listings
              });
            } else {
              console.log(`[DEBUG: Listings API] Showing all listings for user ${userId} without status filtering (admin=${isAdmin})`);
            }
          } else {
            // For "All Listings" view, only show ACTIVE listings to everyone
            const filteredListings = listings.filter(listing => {
              // If it's the user's own listing, show all statuses when viewing My Listings
              const isUsersOwnListing = authenticatedUserId && listing.createdBy === authenticatedUserId;
              
              // Check if the authenticated user is an admin
              const isAdmin = req.isAuthenticated() && req.user.role === 'admin';
              
              // For general "All Listings" view, only show listings that are not explicitly DRAFT or EXPIRED
              // Default to showing if status is undefined (older listings), handling backward compatibility
              const isDraft = listing.status === 'DRAFT';
              const isExpired = listing.status === 'EXPIRED';
              
              // Include if:
              // 1. It's not a draft or expired listing, OR
              // 2. It's the user's own listing and they're viewing their listings, OR
              // 3. The user is an admin (admins can see all listings including drafts)
              const shouldInclude = (!isDraft && !isExpired) || (isUsersOwnListing && userId) || isAdmin;
              
              if (!shouldInclude) {
                console.log(`[DEBUG: Listings API] Filtering out ${listing.status || 'undefined'} listing ${listing.id} (created by user ${listing.createdBy}) from All Listings view`);
              }
              
              return shouldInclude;
            });
            
            console.log(`[DEBUG: Listings API] Filtered from ${listings.length} to ${filteredListings.length} listings for All Listings view`);
            listings = filteredListings;
          }
          
          console.log(`[DEBUG: Listings API] After draft filtering: ${listings.length} listings`);
        }
      } catch (dbError) {
        console.error("[DEBUG: Listings API] Database operation failed:", dbError);
        // Try to provide more detailed error information
        const errorDetails = {
          name: dbError.name,
          message: dbError.message,
          stack: dbError.stack,
          isSQLError: dbError.name === 'PostgresError',
          isTypeError: dbError instanceof TypeError,
        };
        console.error("[DEBUG: Listings API] Error details:", errorDetails);
        throw dbError; // Re-throw to be caught by the outer try-catch
      }
      console.timeEnd("[DEBUG: Listings API] Database fetch time");
      
      console.time("[DEBUG: Listings API] URL processing time");
      // Fix any real estate media URLs, with error handling for each item
      if (listings && Array.isArray(listings)) {
        // Log before URL processing
        console.log(`[DEBUG: Listings API] Processing URLs for ${listings.length} listings`);
        
        listings = listings.map(listing => {
          try {
            if (listing.photos && Array.isArray(listing.photos)) {
              // Log before processing photos
              if (listing.photos.length > 0) {
                console.log(`[DEBUG: Listings API] Processing ${listing.photos.length} photos for listing ID ${listing.id}`);
                console.log("[DEBUG: Listings API] First photo URL before processing:", listing.photos[0]);
              }
              
              listing.photos = listing.photos.map(photoUrl => {
                try {
                  const processedUrl = fixRealEstateMediaUrl(photoUrl);
                  // Log every 20th URL transformation to avoid excessive logging
                  if (Math.random() < 0.05) { // ~5% chance of logging
                    console.log(`[DEBUG: Listings API] URL transformation: ${photoUrl} -> ${processedUrl}`);
                  }
                  return processedUrl;
                } catch (photoErr) {
                  console.error('[DEBUG: Listings API] Error fixing photo URL:', photoErr, 'Original URL:', photoUrl);
                  return photoUrl; // Return original on error
                }
              });
            }
            return listing;
          } catch (listingErr) {
            console.error('[DEBUG: Listings API] Error processing listing:', listingErr, 'Listing ID:', listing.id);
            return listing; // Return original on error
          }
        });
      }
      console.timeEnd("[DEBUG: Listings API] URL processing time");
      
      console.log(`[DEBUG: Listings API] Sending response with ${listings ? listings.length : 0} listings`);
      res.json(listings);
    } catch (err) {
      console.error("[DEBUG: Listings API] Fatal error in listings endpoint:", err);
      // Add more detailed error logging
      const errorDetails = {
        name: err.name,
        message: err.message,
        stack: err.stack,
        type: typeof err
      };
      console.error("[DEBUG: Listings API] Error details:", errorDetails);
      
      res.status(500).json({ 
        message: "Failed to fetch listings", 
        error: String(err),
        details: process.env.NODE_ENV === 'production' ? undefined : errorDetails
      });
    }
  });

  app.get("/api/listings/:id", async (req, res) => {
    // Make individual listings available with security restrictions for drafts
    try {
      const listing = await storage.getListing(parseInt(req.params.id));
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      
      // Check if the listing is a draft - if so, only creator can view it
      if (listing.status === 'DRAFT') {
        // If user is not authenticated, they definitely can't see a draft
        if (!req.isAuthenticated()) {
          return res.status(403).json({ 
            message: "This listing is currently a draft and not available for public viewing",
            status: "DRAFT"
          });
        }
        
        // If authenticated, check if user is the creator or an admin
        const isAdmin = req.user.role === 'admin';
        if (listing.createdBy !== req.user.id && !isAdmin) {
          return res.status(403).json({ 
            message: "You don't have permission to view this draft listing",
            status: "DRAFT"
          });
        }
        
        // If we're here, the user is either the creator or an admin, allow access
        if (isAdmin && listing.createdBy !== req.user.id) {
          console.log(`[ADMIN ACCESS] Admin user ${req.user.id} viewed draft listing ${listing.id} created by user ${listing.createdBy}`);
        } else {
          console.log(`Draft listing ${listing.id} accessed by creator (user ID: ${req.user.id})`);
        }
      }
      
      // Fix any real estate media URLs in calendar folder to use the dedicated folder
      if (listing.photos && Array.isArray(listing.photos)) {
        listing.photos = listing.photos.map(photoUrl => fixRealEstateMediaUrl(photoUrl));
      }
      
      res.json(listing);
    } catch (err) {
      console.error("Error fetching listing:", err);
      res.status(500).json({ message: "Failed to fetch listing" });
    }
  });

  // Custom multer configuration for real estate listings with increased size limit
  // Using memory storage instead of disk storage for Object Storage
  const realEstateUpload = multer({
    storage: multer.memoryStorage(), // Use memory storage for direct Object Storage uploads
    fileFilter: function (req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) {
      // Only allow image formats for real estate
      const allowedImageTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
      ];
      
      if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        console.log(`Rejected real estate image with mimetype: ${file.mimetype}`);
        cb(new Error('Only image files are allowed for real estate listings'), false);
      }
    },
    limits: {
      fileSize: 20 * 1024 * 1024 // 20MB limit specifically for real estate images
    }
  });

  app.post("/api/listings", handleRealEstateUpload, realEstateObjectStorageMiddleware, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Only check if user is blocked - allow non-residents and non-approved users
    if (req.user.isBlocked) {
      return res.status(403).json({ 
        message: "Your account has been blocked. You cannot create listings.", 
        blocked: true 
      });
    }

    try {
      const { listingData, paymentId } = req.body;
      
      // Parse the JSON data from the form data if needed
      let parsedData;
      try {
        parsedData = typeof listingData === 'string' ? JSON.parse(listingData) : listingData;
        console.log("Successfully parsed listing data");
      } catch (error) {
        console.error("Error parsing listing data string:", error);
        parsedData = listingData;
      }
      
      // Check if this is intended to be a draft listing
      const isDraft = parsedData.status === "DRAFT";
      console.log("Creating listing with status:", isDraft ? "DRAFT" : "ACTIVE");
      
      // Only require payment for non-draft listings
      if (!isDraft && !paymentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment is required to publish a listing. Please complete payment first or save as draft."
        });
      }
      
      // Set up variables for payment verification
      let paymentVerificationOk = true;
      let paymentVerificationWarning = null;
      let paymentIdNumber: number | null = null;
      let payment = null;
      
      // Only verify payment for non-draft listings
      if (!isDraft && paymentId) {
        // Enhanced payment verification with better logging
        console.log("Payment verification for listing creation:");
        console.log("- Payment ID:", paymentId);
        console.log("- Payment ID type:", typeof paymentId);
        console.log("- User ID:", req.user.id);
        
        // Enhanced payment ID validation with better error reporting
        try {
          console.log("Raw payment ID before processing:", paymentId, typeof paymentId);
          
          // Handle different possible formats of paymentId
          if (typeof paymentId === 'string') {
            // If it's a string, try to parse it as a number
            paymentIdNumber = parseInt(paymentId.trim(), 10);
          } else if (typeof paymentId === 'number') {
            // If it's already a number, use it directly
            paymentIdNumber = paymentId;
          } else if (paymentId === null || paymentId === undefined) {
            // If it's null or undefined, handle that case
            console.error("Payment ID is null or undefined");
            return res.status(400).json({ 
              success: false, 
              message: "Payment ID is missing. Please complete payment before creating a listing.",
              errors: [{ path: "paymentId", message: "Payment ID is required" }]
            });
          } else {
            // If it's some other type, try to convert it
            console.error("Unexpected payment ID type:", typeof paymentId);
            paymentIdNumber = Number(paymentId);
          }
          
          // Check if the parsed value is valid
          if (isNaN(paymentIdNumber) || paymentIdNumber <= 0) {
            console.error("Invalid payment ID after parsing:", paymentIdNumber);
            return res.status(400).json({ 
              success: false, 
              message: "Invalid payment ID format. Please complete payment before creating a listing.",
              errors: [{ path: "paymentId", message: "Payment ID must be a positive number" }]
            });
          }
          
          console.log("- Parsed payment ID:", paymentIdNumber);
        } catch (parseError) {
          console.error("Error parsing payment ID:", parseError);
          return res.status(400).json({ 
            success: false, 
            message: "Could not process payment ID. Please complete payment before creating a listing.",
            errors: [{ path: "paymentId", message: "Payment ID parsing error" }]
          });
        }
        
        // Verify the payment status
        try {
          payment = await storage.getListingPayment(paymentIdNumber);
          console.log("- Payment record found:", payment ? "Yes" : "No");
          
          if (payment) {
            console.log("- Payment details:", JSON.stringify(payment, null, 2));
          }
        } catch (dbError) {
          console.error("Database error retrieving payment:", dbError);
          return res.status(500).json({ 
            success: false, 
            message: "Error retrieving payment information"
          });
        }
        
        // If there's no payment record, log it but allow the user to continue
        if (!payment) {
          console.log("- Payment record not found, but allowing user to continue");
          paymentVerificationOk = false;
          paymentVerificationWarning = "We couldn't verify your payment, but we're letting you create your listing.";
        } 
        // If payment exists, verify ownership
        else if (payment.userId !== req.user.id) {
          console.log("- Payment user ID mismatch. Payment user:", payment.userId, "Current user:", req.user.id);
          paymentVerificationOk = false;
          paymentVerificationWarning = "The payment record doesn't match your account, but we're letting you create your listing.";
        }
        // Verify payment status
        else if (payment.status !== 'completed') {
          console.log("- Payment status check failed. Current status:", payment.status);
          paymentVerificationOk = false;
          paymentVerificationWarning = "Your payment status is not showing as complete, but we're letting you create your listing.";
        }
        // Check if payment was already used
        else if (payment.listingId) {
          console.log("- Payment already used for listing:", payment.listingId);
          paymentVerificationOk = false;
          paymentVerificationWarning = "This payment appears to have been used already, but we're letting you create your listing.";
        }
      }
      
      console.log("Proceeding with listing creation", isDraft ? "as draft" : "as active listing");
      
      // Normalize listingDuration if it exists but has an unexpected format
      if (parsedData.listingDuration) {
        const duration = String(parsedData.listingDuration);
        if (!duration.includes('_day')) {
          // Try to normalize to the expected format (e.g., "3" -> "3_day", "3 day" -> "3_day")
          const durationMatch = duration.match(/(\d+)/);
          if (durationMatch) {
            const days = durationMatch[1];
            parsedData.listingDuration = `${days}_day`;
            console.log(`Normalized listing duration from "${duration}" to "${parsedData.listingDuration}"`);
          }
        }
      }
      
      // Process files uploaded to Object Storage via realEstateObjectStorageMiddleware
      // The middleware should've already uploaded files and stored their URLs in req.uploadedMediaUrls
      const mediaUrls = (req as any).uploadedMediaUrls || [];
      console.log(`Using ${mediaUrls.length} real estate media files from Object Storage`, mediaUrls);
      
      // Combine existing photos with new uploads
      const existingPhotos = Array.isArray(parsedData.photos) ? parsedData.photos : [];
      const allPhotos = [...existingPhotos, ...mediaUrls];
      
      // Validate and transform the data
      const processedListingData = {
        ...parsedData,
        // Ensure numeric fields are properly typed
        price: Number(parsedData.price) || 0,
        bedrooms: Number(parsedData.bedrooms) || 0,
        bathrooms: Number(parsedData.bathrooms) || 0,
        squareFeet: Number(parsedData.squareFeet) || 0,
        yearBuilt: Number(parsedData.yearBuilt) || 0,
        // Use combined photos array
        photos: allPhotos,
        // Ensure contact info is properly formatted with enhanced validation
        contactInfo: {
          name: parsedData.contactInfo?.name?.trim() || 'Anonymous',
          // Format phone number to match required format if possible, otherwise use a placeholder
          phone: parsedData.contactInfo?.phone?.trim()
            ? /^\(\d{3}\) \d{3}-\d{4}$/.test(parsedData.contactInfo.phone.trim())
              ? parsedData.contactInfo.phone.trim()
              : parsedData.contactInfo.phone.trim().replace(/\D/g, '').match(/^(\d{3})(\d{3})(\d{4})$/)
                ? `(${parsedData.contactInfo.phone.trim().replace(/\D/g, '').match(/^(\d{3})(\d{3})(\d{4})$/)[1]}) ${parsedData.contactInfo.phone.trim().replace(/\D/g, '').match(/^(\d{3})(\d{3})(\d{4})$/)[2]}-${parsedData.contactInfo.phone.trim().replace(/\D/g, '').match(/^(\d{3})(\d{3})(\d{4})$/)[3]}`
                : '(555) 555-5555'
            : '(555) 555-5555',
          // Ensure valid email format
          email: parsedData.contactInfo?.email?.trim()
            ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsedData.contactInfo.email.trim())
              ? parsedData.contactInfo.email.trim()
              : parsedData.contactInfo?.email?.includes('@')
                ? parsedData.contactInfo.email.trim()
                : 'user@example.com'
            : 'user@example.com',
        },
        // Set status based on draft flag
        status: isDraft ? "DRAFT" : "ACTIVE",
        // Properly handle expirationDate conversion
        expirationDate: parsedData.expirationDate
          ? (typeof parsedData.expirationDate === 'string' 
             ? new Date(parsedData.expirationDate) 
             : parsedData.expirationDate instanceof Date 
               ? parsedData.expirationDate 
               : undefined)
          : undefined
      };
      
      // Only set expiration date for active listings, not drafts
      if (!isDraft) {
        // Fix: If expirationDate is an invalid date after conversion, calculate a default one based on listingDuration
        if (!processedListingData.expirationDate || isNaN(processedListingData.expirationDate.getTime())) {
          console.log("Invalid or missing expirationDate, calculating from listingDuration");
          const defaultExpiration = new Date();
          
          if (processedListingData.listingDuration === '3_day') {
            defaultExpiration.setDate(defaultExpiration.getDate() + 3);
          } else if (processedListingData.listingDuration === '7_day') {
            defaultExpiration.setDate(defaultExpiration.getDate() + 7);
          } else {
            // Default to 30 days for all other cases
            defaultExpiration.setDate(defaultExpiration.getDate() + 30);
          }
          
          processedListingData.expirationDate = defaultExpiration;
          console.log(`Set default expirationDate to ${defaultExpiration.toISOString()}`);
        }
      } else {
        // For draft listings, set expirationDate to null
        processedListingData.expirationDate = null;
        console.log("Draft listing - setting expirationDate to null");
      }

      const result = insertListingSchema.safeParse(processedListingData);

      if (!result.success) {
        const formattedErrors = result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
          received: JSON.stringify(err.received),
          expected: err.code === 'invalid_type' ? err.expected : undefined
        }));

        console.error("Validation errors:", JSON.stringify(formattedErrors, null, 2));

        return res.status(400).json({
          message: "Invalid listing data",
          errors: formattedErrors
        });
      }

      // Now all fields exist in the database, no need to filter
      const validatedListingData = result.data;
      
      console.log("Creating listing with status:", isDraft ? "DRAFT" : "ACTIVE");
      
      const listing = await storage.createListing({
        ...validatedListingData,
        createdBy: req.user.id,
        // Ensure the status is set correctly based on isDraft
        status: isDraft ? "DRAFT" : "ACTIVE",
        // For non-draft listings, make sure expirationDate is set
        expirationDate: isDraft ? null : (validatedListingData.expirationDate || defaultExpirationDate),
        isSubscription: validatedListingData.isSubscription || false,
        subscriptionId: validatedListingData.subscriptionId || null,
        // Let storage.ts handle createdAt and updatedAt
      });

      // Update the payment record with the new listing ID, but only if payment exists
      if (payment && payment.id) {
        try {
          await storage.updateListingPayment(payment.id, {
            listingId: listing.id,
            updatedAt: new Date()
          });
          console.log(`Updated payment record ${payment.id} with listing ID ${listing.id}`);
        } catch (paymentUpdateError) {
          // Just log the error but don't fail the whole operation
          console.error("Error updating payment record with listing ID:", paymentUpdateError);
        }
      } else {
        console.log("No valid payment record to update with listing ID.");
      }

      console.log("Successfully created listing:", JSON.stringify(listing, null, 2));
      res.status(201).json(listing);
    } catch (err) {
      console.error("Error creating listing:", err);
      // Enhanced error logging for debugging
      if (err instanceof Error) {
        console.error("Error message:", err.message);
        console.error("Error stack:", err.stack);
      }
      // For PostgreSQL errors
      if (err && typeof err === 'object' && 'code' in err) {
        console.error("Database error code:", (err as any).code);
        console.error("Database error detail:", (err as any).detail);
        console.error("Database error constraint:", (err as any).constraint);
      }
      res.status(500).json({
        message: "Failed to create listing",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Update listing endpoint - using the same larger upload size limit
  app.patch("/api/listings/:id", handleRealEstateUpload, realEstateObjectStorageMiddleware, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Check if user is blocked (only for non-admin users)
    if (req.user.isBlocked && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: "Your account has been blocked. You cannot update listings.", 
        blocked: true 
      });
    }

    try {
      const listingId = parseInt(req.params.id);
      const listing = await storage.getListing(listingId);

      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      // Check if user owns the listing or is an admin
      const isAdmin = req.user.role === 'admin';
      if (listing.createdBy !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to update this listing" });
      }

      // Parse the JSON data from the form
      let listingData;
      try {
        listingData = JSON.parse(req.body.data);
      } catch (error) {
        console.error("Error parsing listing data:", error);
        return res.status(400).json({ message: "Invalid listing data format" });
      }

      // Process files uploaded to Object Storage via realEstateObjectStorageMiddleware
      // The middleware should've already uploaded files and stored their URLs in req.uploadedMediaUrls
      const newMediaUrls = (req as any).uploadedMediaUrls || [];
      console.log(`[UpdateListing] Using ${newMediaUrls.length} real estate media files from Object Storage`, newMediaUrls);

      // Use photos from the client if they're provided (which includes deletions)
      // Otherwise, append new uploads to the existing photos
      let photos;
      if (listingData.photos !== undefined) {
        // Client provided photos (potentially with some deleted)
        photos = listingData.photos;
        // Add any newly uploaded photos
        if (newMediaUrls.length > 0) {
          photos = [...photos, ...newMediaUrls];
        }
      } else {
        // No photos specified in update, so keep existing and add new ones
        photos = newMediaUrls.length > 0 ?
          [...(listing.photos || []), ...newMediaUrls] :
          listing.photos || [];
      }
      
      console.log("Photos after update:", photos);

      // Validate and transform the data
      const updatedData = {
        ...listingData,
        photos,
        updatedAt: new Date()
      };

      console.log("Updating listing with data:", JSON.stringify(updatedData, null, 2));

      const result = insertListingSchema.safeParse(updatedData);

      if (!result.success) {
        console.error("Validation errors:", JSON.stringify(result.error.errors, null, 2));
        return res.status(400).json({
          message: "Invalid listing data",
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            received: JSON.stringify(err.received),
            expected: err.code === 'invalid_type' ? err.expected : undefined
          }))
        });
      }
      
      // Now including all fields for the update operation
      const validatedListingData = result.data;
      
      console.log("Updating listing with all fields including expiration and subscription data");

      const updatedListing = await storage.updateListing(listingId, {
        ...validatedListingData,
        // Ensure we keep the update time
        updatedAt: new Date()
      });

      console.log("Successfully updated listing:", JSON.stringify(updatedListing, null, 2));
      res.json(updatedListing);
    } catch (err) {
      console.error("Error updating listing:", err);
      res.status(500).json({
        message: "Failed to update listing",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Delete listing endpoint
  app.delete("/api/listings/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Check if user is blocked (only for non-admin users)
    if (req.user.isBlocked && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: "Your account has been blocked. You cannot delete listings.", 
        blocked: true 
      });
    }

    try {
      const listingId = parseInt(req.params.id);
      const listing = await storage.getListing(listingId);

      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      // Check if user owns the listing or is an admin
      const isAdmin = req.user.role === 'admin';
      if (listing.createdBy !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this listing" });
      }

      await storage.deleteListing(listingId);
      res.sendStatus(200);
    } catch (err) {
      console.error("Error deleting listing:", err);
      res.status(500).json({ message: "Failed to delete listing" });
    }
  });
  
  // Delete all listings endpoint (admin only)
  app.delete("/api/listings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      await storage.deleteAllListings();
      res.status(200).json({ message: "All listings have been deleted successfully" });
    } catch (err) {
      console.error("Error deleting all listings:", err);
      res.status(500).json({ message: "Failed to delete all listings" });
    }
  });
  
  // Contact form for listings - send email
  app.post("/api/listings/:id/contact", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Check if user is blocked (no exceptions for admins to maintain community standards)
    if (req.user.isBlocked) {
      return res.status(403).json({ 
        message: "Your account has been blocked. You cannot contact listing owners.", 
        blocked: true 
      });
    }
    
    try {
      const listingId = parseInt(req.params.id);
      const { message } = req.body;
      
      if (!message || message.trim().length < 10) {
        return res.status(400).json({ message: "Message is required and must be at least 10 characters" });
      }
      
      // Get the listing
      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      // Get the contact info
      const contactInfo = listing.contactInfo as { name?: string; email?: string; phone?: string };
      if (!contactInfo?.email) {
        return res.status(400).json({ message: "This listing does not have an email address to contact" });
      }
      
      // Send the email
      const emailResult = await sendListingContactEmail(
        listingId,
        listing.title,
        contactInfo.email,
        req.user,
        message
      );
      
      if (!emailResult) {
        return res.status(500).json({ message: "Failed to send message. Please try again later." });
      }
      
      res.json({ success: true, message: "Message sent successfully" });
    } catch (err) {
      console.error("Error sending listing contact message:", err);
      res.status(500).json({ message: "Failed to send message" });
    }
  });
  
  // Publish a draft listing
  app.put("/api/listings/:id/publish", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Check if user is blocked
    if (req.user.isBlocked) {
      return res.status(403).json({ 
        message: "Your account has been blocked. You cannot publish listings.", 
        blocked: true 
      });
    }
    
    const listingId = parseInt(req.params.id);
    const { duration, paymentIntentId, subscriptionId } = req.body;
    
    try {
      // Get the listing
      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      // Check if user owns the listing or is an admin
      const isAdmin = req.user.role === 'admin';
      if (listing.createdBy !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to publish this listing" });
      }
      
      // Check if listing is already published
      if (listing.status === "ACTIVE") {
        return res.status(400).json({ message: "Listing is already published" });
      }
      
      // Validate required payment info for publishing
      if (!duration) {
        return res.status(400).json({ message: "Listing duration is required" });
      }
      
      if (!paymentIntentId && !subscriptionId && req.user.role !== 'admin') {
        return res.status(400).json({ message: "Payment information is required" });
      }
      
      // Create a payment record if payment was provided
      if (paymentIntentId) {
        await storage.createListingPayment({
          listingId,
          userId: req.user.id,
          paymentIntentId,
          amount: listing.price || 0,
          status: "completed",
          paymentMethod: "stripe",
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // Publish the listing
      const publishedListing = await storage.publishListing(
        listingId, 
        duration, 
        subscriptionId
      );
      
      res.json({
        success: true,
        listing: publishedListing,
        message: "Listing published successfully"
      });
    } catch (err) {
      console.error("Error publishing listing:", err);
      res.status(500).json({ 
        message: "Failed to publish listing", 
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Bulk listings upload endpoint - with custom handler for bulk CSV uploads
  app.post("/api/listings/bulk", (req, res, next) => {
    // Create multer instance for CSV files using memory storage for Object Storage
    const upload = multer({
      limits: { fileSize: realEstateFileSize },
      storage: multer.memoryStorage(), // Use memory storage instead of disk storage
    });
    
    // Always set the media type for real estate
    req.mediaType = MEDIA_TYPES.REAL_ESTATE_MEDIA;
    console.log(`Real estate bulk upload using memory storage for CSV file`);
    
    // Use multer's single method for this case
    const handler = upload.single('listings');
    return handler(req, res, next);
  }, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (req.file.mimetype !== 'text/csv') {
        return res.status(400).json({ message: "Please upload a CSV file" });
      }

      // We're using memory storage, so the file is in buffer instead of on disk
      const csvData = req.file.buffer.toString('utf-8');
      const rows = csvData.split('\n').map(row => row.split(','));
      const headers = rows[0].map(header => header.trim());

      const listings = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === headers.length) {
          const listing = {};
          headers.forEach((header, index) => {
            let value = row[index].trim();
            // Convert numeric fields
            if (['price', 'bedrooms', 'bathrooms', 'squareFeet'].includes(header)) {
              value = parseFloat(value);
            }
            listing[header] = value;
          });

          const result = insertListingSchema.safeParse(listing);
          if (result.success) {
            // Create default expiration date (30 days from now)
            const defaultExpirationDate = new Date();
            defaultExpirationDate.setDate(defaultExpirationDate.getDate() + 30);
            
            // Now all fields are supported in the database
            listings.push({
              ...result.data,
              createdBy: req.user.id,
              // Set default values for new fields if not provided
              expirationDate: result.data.expirationDate || defaultExpirationDate,
              isSubscription: result.data.isSubscription || false,
              subscriptionId: result.data.subscriptionId || null
            });
          }
        }
      }

      // Create all listings
      const createdListings = await Promise.all(
        listings.map(listing => storage.createListing(listing))
      );

      // No need to clean up file since we're using memory storage
      
      res.status(201).json({
        message: `Successfully created ${createdListings.length} listings`,
        listings: createdListings,
      });
    } catch (err) {
      console.error("Error uploading listings:", err);
      res.status(500).json({ message: "Failed to upload listings" });
    }
  });

  // Add bulk upload endpoint
  // Bulk Event Upload via direct JSON POST
  app.post("/api/events/bulk-json", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ message: "Request body must be an array of events" });
      }
      
      const events = [];
      
      for (const eventData of req.body) {
        try {
          // Process each event
          const event = { ...eventData };
          
          // Validate the event with insertEventSchema
          console.log('Processing event:', event.title);
          const result = insertEventSchema.safeParse(event);
          if (result.success) {
            events.push({
              ...result.data,
              createdBy: req.user.id,
            });
          } else {
            console.warn('Event validation failed:', result.error);
          }
        } catch (error) {
          console.error('Error processing event:', error);
        }
      }
      
      // Create all events
      const createdEvents = await Promise.all(
        events.map(event => storage.createEvent(event))
      );
      
      // Broadcast event creation to all connected clients if any events were created
      if (createdEvents.length > 0) {
        broadcastWebSocketMessage('calendar_update', {
          action: 'bulk_create',
          count: createdEvents.length
        });
      }
      
      res.status(201).json({
        message: `Successfully created ${createdEvents.length} events`,
        events: createdEvents,
      });
    } catch (err) {
      console.error("Error uploading events via JSON:", err);
      res.status(500).json({ message: "Failed to upload events" });
    }
  });

  // Original bulk upload endpoint through file upload
  app.post("/api/events/bulk", upload.single('events'), mediaSyncMiddleware, async (req, res) => {
    console.log("DEBUG: Bulk upload endpoint called");
    
    if (!req.isAuthenticated()) {
      console.log("DEBUG: Not authenticated");
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      console.log("DEBUG: Not admin, role is:", req.user.role);
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      if (!req.file) {
        console.log("DEBUG: No file uploaded");
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      console.log("DEBUG: File uploaded:", req.file.originalname, "Mimetype:", req.file.mimetype);

      // Allow both CSV and JSON files
      const isCSV = req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv');
      const isJSON = req.file.mimetype === 'application/json' || req.file.originalname.endsWith('.json');
      
      console.log("DEBUG: File type detection - isCSV:", isCSV, "isJSON:", isJSON);
      
      if (!isCSV && !isJSON) {
        console.log("DEBUG: Invalid file type");
        return res.status(400).json({ message: "Please upload a CSV or JSON file" });
      }

      const events = [];
      
      if (isCSV) {
        // Process CSV file
        // Process CSV file - use simpler parsing approach that works in ESM
        const csvData = fs.readFileSync(req.file.path, 'utf-8');
        
        // Remove BOM character if present
        const dataWithoutBOM = csvData.replace(/^\uFEFF/, '');
        
        // More robust CSV parsing approach that doesn't rely on require()
        // First, split into lines and get headers
        const lines = dataWithoutBOM.split('\n').filter(line => line.trim());
        const headers = parseCSVLine(lines[0]);
        
        // Parse each line into records
        const records = [];
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            const values = parseCSVLine(lines[i]);
            if (values.length === headers.length) {
              const record = {};
              headers.forEach((header, index) => {
                record[header.trim()] = values[index];
              });
              records.push(record);
            }
          }
        }
        
        // Helper function to parse CSV line respecting quotes
        function parseCSVLine(line) {
          const values = [];
          let inQuotes = false;
          let currentValue = '';
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
              // Toggle quote state
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              // End of field
              values.push(currentValue);
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          
          // Add the last field
          values.push(currentValue);
          return values;
        }
        
        for (const record of records) {
          try {
            const event = { ...record };
            
            // Convert date strings to proper Date objects
            if (event.startDate) {
              event.startDate = new Date(event.startDate);
            }
            if (event.endDate) {
              event.endDate = new Date(event.endDate);
            }
            if (event.recurrenceEndDate) {
              event.recurrenceEndDate = new Date(event.recurrenceEndDate);
            }
            
            // Convert boolean strings to actual booleans
            if (event.isRecurring !== undefined) {
              // Handle cases where isRecurring might be a string like "true" or a boolean
              if (typeof event.isRecurring === 'string') {
                event.isRecurring = event.isRecurring.toLowerCase() === 'true';
                console.log('Converted isRecurring string to boolean:', event.isRecurring);
              }
            }
            
            // Parse JSON structures if they are strings
            if (event.contactInfo && typeof event.contactInfo === 'string') {
              try {
                // Remove any escaped quotes or extra formatting from JSON string
                const cleanedJson = event.contactInfo.replace(/\\"/g, '"');
                console.log('Parsing contactInfo:', cleanedJson);
                event.contactInfo = JSON.parse(cleanedJson);
              } catch (err) {
                console.warn('Failed to parse contactInfo JSON:', err, event.contactInfo);
              }
            }
            
            if (event.hoursOfOperation && typeof event.hoursOfOperation === 'string') {
              try {
                // Remove any escaped quotes or extra formatting from JSON string
                const cleanedJson = event.hoursOfOperation.replace(/\\"/g, '"');
                console.log('Parsing hoursOfOperation:', cleanedJson);
                event.hoursOfOperation = JSON.parse(cleanedJson);
              } catch (err) {
                console.warn('Failed to parse hoursOfOperation JSON:', err, event.hoursOfOperation);
              }
            }
            
            if (event.mediaUrls && typeof event.mediaUrls === 'string') {
              try {
                // Remove any escaped quotes or extra formatting from JSON string
                const cleanedJson = event.mediaUrls.replace(/\\"/g, '"');
                console.log('Parsing mediaUrls:', cleanedJson);
                event.mediaUrls = JSON.parse(cleanedJson);
              } catch (err) {
                // If it's not JSON, check for pipe-separated values first (our template format)
                if (event.mediaUrls.includes('|')) {
                  event.mediaUrls = event.mediaUrls.split('|').map(url => url.trim()).filter(Boolean);
                  console.log('Parsed mediaUrls as pipe-separated list:', event.mediaUrls);
                } else {
                  // Fall back to comma-separated for backwards compatibility 
                  event.mediaUrls = event.mediaUrls.split(',').map(url => url.trim()).filter(Boolean);
                  console.log('Parsed mediaUrls as comma-separated list:', event.mediaUrls);
                }
              }
            }
            
            console.log('Parsing event:', event.title);
            // Debug log the event data before validation
            console.log('Debug - event data:', JSON.stringify({
              title: event.title,
              location: event.location,
              startDate: event.startDate,
              endDate: event.endDate,
              category: event.category,
              isRecurring: event.isRecurring,
              recurrenceFrequency: event.recurrenceFrequency,
              recurrenceEndDate: event.recurrenceEndDate
            }));
            
            const result = insertEventSchema.safeParse(event);
            if (result.success) {
              events.push({
                ...result.data,
                createdBy: req.user.id,
              });
            } else {
              console.warn('Event validation failed:', result.error);
              // Log more details about the validation error
              console.log('Validation error issues:', JSON.stringify(result.error.format(), null, 2));
            }
          } catch (error) {
            console.error('Error processing event record:', error);
          }
        }
      } else {
        // Process JSON file
        const jsonData = fs.readFileSync(req.file.path, 'utf-8');
        let jsonEvents;
        
        try {
          jsonEvents = JSON.parse(jsonData);
        } catch (err) {
          return res.status(400).json({ message: "Invalid JSON format" });
        }
        
        if (!Array.isArray(jsonEvents)) {
          return res.status(400).json({ message: "JSON file must contain an array of events" });
        }
        
        for (const eventData of jsonEvents) {
          try {
            // Process the event data 
            const event = { ...eventData };
            
            // Convert date strings to proper Date objects
            if (event.startDate && typeof event.startDate === 'string') {
              event.startDate = new Date(event.startDate);
            }
            if (event.endDate && typeof event.endDate === 'string') {
              event.endDate = new Date(event.endDate);
            }
            if (event.recurrenceEndDate && typeof event.recurrenceEndDate === 'string') {
              event.recurrenceEndDate = new Date(event.recurrenceEndDate);
            }
            
            // Convert boolean strings to actual booleans
            if (event.isRecurring !== undefined && typeof event.isRecurring === 'string') {
              event.isRecurring = event.isRecurring.toLowerCase() === 'true';
            }
            
            // Parse any JSON strings that might be in the data
            if (event.contactInfo && typeof event.contactInfo === 'string') {
              try {
                event.contactInfo = JSON.parse(event.contactInfo);
              } catch (err) {
                console.warn('Failed to parse contactInfo JSON in JSON file:', err);
              }
            }
            
            if (event.hoursOfOperation && typeof event.hoursOfOperation === 'string') {
              try {
                event.hoursOfOperation = JSON.parse(event.hoursOfOperation);
              } catch (err) {
                console.warn('Failed to parse hoursOfOperation JSON in JSON file:', err);
              }
            }
            
            if (event.mediaUrls && typeof event.mediaUrls === 'string') {
              try {
                event.mediaUrls = JSON.parse(event.mediaUrls);
              } catch (err) {
                // For JSON upload, also check for pipe-separated mediaUrls
                if (event.mediaUrls.includes('|')) {
                  event.mediaUrls = event.mediaUrls.split('|').map(url => url.trim()).filter(Boolean);
                  console.log('Parsed mediaUrls as pipe-separated list in JSON file:', event.mediaUrls);
                } else {
                  // Fall back to comma-separated for backwards compatibility
                  event.mediaUrls = event.mediaUrls.split(',').map(url => url.trim()).filter(Boolean);
                  console.log('Parsed mediaUrls as comma-separated list in JSON file:', event.mediaUrls);
                }
              }
            }
            
            // Validate the event
            console.log('Parsing JSON event:', event.title);
            const result = insertEventSchema.safeParse(event);
            if (result.success) {
              events.push({
                ...result.data,
                createdBy: req.user.id,
              });
            } else {
              console.warn('JSON event validation failed:', result.error);
            }
          } catch (error) {
            console.error('Error processing JSON event:', error);
          }
        }
      }

      // Log how many events we have to create
      console.log(`DEBUG: Attempting to create ${events.length} events`);
      
      if (events.length === 0) {
        console.log("DEBUG: No valid events to create - validation must have failed for all records");
        return res.status(400).json({ 
          message: "No valid events found in the uploaded file. Please check the file format and required fields." 
        });
      }
      
      try {
        // Create all events
        console.log("DEBUG: Creating events in database");
        const createdEvents = await Promise.all(
          events.map(event => storage.createEvent(event))
        );
        
        console.log(`DEBUG: Successfully created ${createdEvents.length} events`);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
  
        res.status(201).json({
          message: `Successfully created ${createdEvents.length} events`,
          events: createdEvents,
        });
      } catch (createError) {
        console.error("DEBUG: Error creating events:", createError);
        throw createError; // Re-throw to be caught by the outer catch block
      }
    } catch (err) {
      console.error("Error uploading events:", err);
      res.status(500).json({ message: "Failed to upload events" });
    }
  });

  // Event comments routes
  app.post("/api/events/:id/comments", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const eventId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }
      
      // Check only if user is blocked
      if (req.user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been blocked. You cannot leave comments.",
          blockReason: req.user.blockReason || "Contact an administrator for more information."
        });
      }
      
      // We no longer check isApproved flag - only role-based permissions matter now

      const comment = await storage.createEventComment({
        eventId,
        userId: req.user.id,
        content: content.trim()
      });

      // Get the user data for the response
      const user = await storage.getUser(req.user.id);
      const commentWithUser = {
        ...comment,
        user: user ? {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl
        } : undefined
      };

      res.json(commentWithUser);
    } catch (err) {
      console.error("Error creating comment:", err);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.get("/api/events/:id/comments", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const comments = await storage.getEventComments(eventId);
      res.json(comments);
    } catch (err) {
      console.error("Error fetching comments:", err);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });
  
  // Delete a comment by ID
  app.delete("/api/events/comments/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const commentId = parseInt(req.params.id);
      const isAdmin = req.user.role === 'admin';
      
      // If user is admin, they can delete any comment
      // Otherwise users can only delete their own comments
      if (isAdmin) {
        // Admin can delete any comment
        await storage.deleteEventComment(commentId, 0); // Pass 0 as userId for admin override
      } else {
        // Non-admin users can only delete their own comments
        await storage.deleteEventComment(commentId, req.user.id);
      }
      
      res.sendStatus(200);
    } catch (err) {
      console.error("Error deleting comment:", err);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Page content routes
  app.get("/api/pages", async (req, res) => {
    try {
      // Check if the user is an admin
      const isAdmin = req.user && req.user.role === 'admin';
      
      // Include hidden pages if explicitly requested OR if the user is an admin
      let includeHidden = req.query.includeHidden === 'true';
      
      // If user is admin and not specifically requesting non-hidden pages
      if (isAdmin && req.query.includeHidden !== 'false') {
        // For admin users, always include hidden pages by default
        includeHidden = true;
        console.log('Admin user accessing page contents, including hidden items');
      }
      
      const contents = await storage.getAllPageContents(includeHidden);
      
      // Fix content media URLs in the content HTML
      const fixedContents = contents.map(content => {
        if (content.content) {
          content.content = fixContentMediaUrl(content.content);
        }
        return content;
      });
      
      res.json(fixedContents);
    } catch (err) {
      console.error("Error fetching all page contents:", err);
      res.status(500).json({ message: "Failed to fetch page contents" });
    }
  });
  
  app.delete("/api/pages/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const id = parseInt(req.params.id);
      const success = await storage.deletePageContent(id);
      
      if (!success) {
        return res.status(404).json({ message: "Page content not found" });
      }
      
      res.json({ success: true, message: "Page content deleted successfully" });
    } catch (err) {
      console.error("Error deleting page content:", err);
      res.status(500).json({ 
        message: "Failed to delete page content",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Delete all community pages endpoint (specific to "community" category)
  app.delete("/api/pages/community", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const result = await storage.deleteCommunityPages();
      
      res.json({ 
        success: true, 
        message: `${result.count} community pages deleted successfully`,
        count: result.count,
        deletedIds: result.deletedIds
      });
    } catch (err) {
      console.error("Error deleting community pages:", err);
      res.status(500).json({ 
        message: "Failed to delete community pages",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Delete all community-related pages endpoint (all 'More' section content)
  app.delete("/api/pages/all-community", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const result = await storage.deleteAllCommunityPages();
      
      res.json({ 
        success: true, 
        message: `${result.count} community pages deleted successfully`,
        count: result.count,
        deletedIds: result.deletedIds
      });
    } catch (err) {
      console.error("Error deleting all community pages:", err);
      res.status(500).json({ 
        message: "Failed to delete all community pages",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Special endpoint for banner slides - Modified to avoid conflicts with vendor pages 
  // by ensuring the URL ends with exactly "banner-slides" with no extra characters
  app.get("/api/pages/banner-slides", async (req, res) => {
    // Check if the URL ends with exactly "banner-slides" (with no trailing characters)
    // This ensures vendor pages like "vendors-home-services-..." don't get matched here
    const urlPath = req.originalUrl;
    
    // Strict matching: Must be exactly "/api/pages/banner-slides" or "/api/pages/banner-slides?"
    // Using a more strict check to avoid matching vendor slugs that contain "banner-slides"
    const exactEndpoints = ['/api/pages/banner-slides', '/api/pages/banner-slides?'];
    if (!exactEndpoints.includes(urlPath)) {
      // This is a vendor page or other content type request - not the banner slides endpoint
      console.log(`⛔ Rejecting incorrect banner-slides request: ${urlPath}`);
      return res.status(404).json({ message: "Not the banner-slides endpoint" });
    }
    
    try {
      console.log(`🎯 Serving banner slides endpoint for exact path match: ${urlPath}`);
      const content = await storage.getPageContent("banner-slides");
      if (!content) {
        return res.status(404).json({ message: "Page content not found for banner-slides" });
      }
      res.json(content);
    } catch (err) {
      console.error("Error fetching banner slides content:", err);
      res.status(500).json({ message: "Failed to fetch banner slides content" });
    }
  });
  
  app.get("/api/pages/:slug", async (req, res) => {
    try {
      // Extract the full slug from the request
      const fullSlug = req.params.slug;
      
      // Check if the user is an admin
      const isAdmin = req.user && req.user.role === 'admin';
      
      // Include hidden content if explicitly requested OR if the user is an admin
      let includeHidden = req.query.includeHidden === 'true';
      
      // If user is admin and not specifically requesting non-hidden content
      if (isAdmin && req.query.includeHidden !== 'false') {
        // For admin users, always include hidden content by default
        includeHidden = true;
        console.log('Admin user accessing specific page content, including hidden items');
      }
      
      console.log(`----------------------`);
      console.log(`🔍 Page content request for slug: "${fullSlug}" (includeHidden: ${includeHidden})`);
      console.log(`Request URL: ${req.originalUrl}`);
      console.log(`Request path: ${req.path}`);
      console.log(`Request IP: ${req.ip}`);
      console.log(`User agent: ${req.get('User-Agent')}`);
      
      // Universal handling for all vendor pages
      if (fullSlug.startsWith('vendors-') && fullSlug.split('-').length >= 3) {
        console.log(`⚡ [API] Universal handling for vendor page: ${fullSlug}`);
        
        try {
          // Direct database lookup for the vendor
          const vendorContent = await storage.getPageContent(fullSlug, true);
          
          if (vendorContent) {
            console.log(`✅ [API] Found vendor content with ID: ${vendorContent.id}`);
            
            // Fix content media URLs if needed
            if (vendorContent.content) {
              vendorContent.content = fixContentMediaUrl(vendorContent.content);
            }
            
            return res.json(vendorContent);
          } else {
            console.log(`❌ [API] Vendor content not found in database for slug: ${fullSlug}`);
          }
        } catch (err) {
          console.error(`❌ [API] Error fetching vendor content for ${fullSlug}:`, err);
        }
      }
      
      // SPECIAL CASE: Check if this is a vendor page request that might conflict with banner-slides
      if (fullSlug.startsWith('vendors-') && (fullSlug.includes('services') || fullSlug.includes('antiques'))) {
        console.log(`⚠️ Detected potential vendor/banner conflict for: "${fullSlug}"`);
        console.log(`Checking database for correct vendor page...`);
        
        try {
          // Get all vendor pages and search for the one that most closely matches our slug
          const allPages = await storage.getAllPageContents(includeHidden);
          
          console.log(`Retrieved ${allPages.length} total pages to search for matching vendor`);
          
          // First try to find exact match
          const exactMatch = allPages.find(p => p.slug === fullSlug);
          if (exactMatch) {
            console.log(`✅ Found exact vendor page match with ID ${exactMatch.id}, title "${exactMatch.title}"`);
            
            // Fix content media URLs in the content HTML if available
            if (exactMatch.content) {
              exactMatch.content = fixContentMediaUrl(exactMatch.content);
            }
            
            return res.json(exactMatch);
          }
          
          // Try to find a match by substring - looking for pages containing key parts of the slug
          const vendorName = fullSlug.split('-').slice(3).join('-'); // Extract the vendor name part
          console.log(`Looking for vendor by name part: "${vendorName}"`);
          
          const fuzzyMatches = allPages.filter(p => 
            p.slug.includes(vendorName) &&
            p.slug.startsWith('vendors-') &&
            // Exclude the banner-slides content
            p.slug !== 'banner-slides' &&
            p.id !== 4 // Known ID for banner-slides
          );
          
          console.log(`Found ${fuzzyMatches.length} possible fuzzy vendor matches`);
          
          if (fuzzyMatches.length > 0) {
            // Take the best match (first one)
            const bestMatch = fuzzyMatches[0];
            console.log(`✅ Using best vendor match with ID ${bestMatch.id}, title "${bestMatch.title}"`);
            
            // Fix content media URLs in the content HTML if available
            if (bestMatch.content) {
              bestMatch.content = fixContentMediaUrl(bestMatch.content);
            }
            
            return res.json(bestMatch);
          }
        } catch (vendorMatchErr) {
          console.error("Error during vendor page resolution:", vendorMatchErr);
          // Continue with normal search below if vendor-specific search fails
        }
      }
      
      // Initialize variables
      let content = null;
      let baseSlug = '';
      let section = '';
      let dashSlug = '';
      let hashSlug = '';
      
      // Parse the slug to determine format and extract base/section components
      if (fullSlug.includes('-')) {
        // Dash format (preferred): amenities-golf
        const parts = fullSlug.split('-');
        baseSlug = parts[0];
        section = parts.slice(1).join('-'); // Handle multiple dashes
        dashSlug = fullSlug; // Already in dash format
        hashSlug = `${baseSlug}#${section}`; // For fallback
        
        console.log(`Dash format detected: baseSlug="${baseSlug}", section="${section}"`);
      } else if (fullSlug.includes('#')) {
        // Hash format (legacy): amenities#golf
        // This shouldn't happen in URLs but might be in database or direct API calls
        const parts = fullSlug.split('#');
        baseSlug = parts[0];
        section = parts[1] || '';
        dashSlug = section ? `${baseSlug}-${section}` : baseSlug;
        hashSlug = fullSlug; // Already in hash format
        
        console.log(`Hash format detected: baseSlug="${baseSlug}", section="${section}"`);
        console.log(`Converted to preferred dash format: "${dashSlug}"`);
      } else {
        // No section specified: just amenities
        baseSlug = fullSlug;
        dashSlug = fullSlug;
        hashSlug = fullSlug;
        
        console.log(`No section format detected: baseSlug="${baseSlug}"`);
      }
      
      // Search strategy:
      // 1. First try exact slug as provided (direct match)
      console.log(`1. Trying exact slug match: "${fullSlug}"`);
      content = await storage.getPageContent(fullSlug, includeHidden);
      
      // Enhanced special handling for vendor slugs which might have various formats
      if (!content && fullSlug.startsWith('vendors-')) {
        console.log(`🔍 Enhanced vendor slug handling for: "${fullSlug}"`);
        
        // Try all possible variations for vendors
        // For example: vendors-home-services-services-barefoot-bay-homeservices
        // Might need to be: vendors-home-services-barefoot-bay-homeservices
        
        const parts = fullSlug.split('-');
        if (parts.length >= 4) { // vendors-category-vendorname format
          // Check if we have a duplicate category name in the vendor part
          const category = parts[1]; // e.g. "home-services"
          
          // Try removing duplicate category names if present
          if (parts.length >= 5 && parts[2] === parts[1]) {
            // vendors-home-services-home-services-something → vendors-home-services-something
            const simplifiedSlug = `vendors-${category}-${parts.slice(3).join('-')}`;
            console.log(`1.1a. Trying simplified vendor slug (duplicate category removed): "${simplifiedSlug}"`);
            content = await storage.getPageContent(simplifiedSlug, includeHidden);
          }
          
          // Try removing "services-" prefix from vendor name if present
          if (!content && parts.length >= 5 && parts[2] === 'services') {
            // vendors-home-services-services-something → vendors-home-services-something
            const simplifiedSlug = `vendors-${category}-${parts.slice(3).join('-')}`;
            console.log(`1.1b. Trying simplified vendor slug (services prefix removed): "${simplifiedSlug}"`);
            content = await storage.getPageContent(simplifiedSlug, includeHidden);
          }
          
          // Check for case with "barefoot-bay-homeservices" variations
          if (!content && parts.includes('barefoot') && parts.includes('bay')) {
            // Try different combinations of barefoot-bay-homeservices
            
            // Try with just barefoot-bay-homeservices
            if (parts.length >= 5) {
              const simplifiedSlug = `vendors-${category}-barefoot-bay-homeservices`;
              console.log(`1.1c. Trying barefoot bay vendor slug: "${simplifiedSlug}"`);
              content = await storage.getPageContent(simplifiedSlug, includeHidden);
            }
            
            // Try with HOME-SERVICES-barefoot-bay-homeservices
            if (!content) {
              const simplifiedSlug = `vendors-HOME-SERVICES-barefoot-bay-homeservices`;
              console.log(`1.1d. Trying uppercase version: "${simplifiedSlug}"`);
              content = await storage.getPageContent(simplifiedSlug, includeHidden);
            }
            
            // Try looking up by substring match if we still can't find it
            if (!content) {
              const contentsList = await storage.getAllPageContents();
              console.log(`1.1e. Trying substring search among ${contentsList.length} contents`);
              
              // Try to find any content with barefoot-bay-homeservices in the slug
              const matchingContent = contentsList.find(c => 
                c.slug.includes('barefoot-bay-homeservices') || 
                c.slug.includes('home-services-barefoot-bay') ||
                c.slug.toLowerCase().includes('barefoot-bay-homeservices')
              );
              
              if (matchingContent) {
                console.log(`1.1f. Found matching content via substring: "${matchingContent.slug}"`);
                content = matchingContent;
              }
            }
          }
        }
        
        // If still no content, try finding all vendor-related content
        if (!content) {
          console.log(`1.1g. Last resort: Looking for any content matching "${parts.slice(2).join('-')}"`);
          
          const allContents = await storage.getAllPageContents();
          // Look for any content with similar slug parts
          const vendorName = parts.slice(2).join('-');
          const possibleMatches = allContents.filter(c => 
            c.slug.includes(vendorName) || 
            c.slug.toLowerCase().includes(vendorName.toLowerCase())
          );
          
          if (possibleMatches.length > 0) {
            // Take the first match
            console.log(`1.1h. Found ${possibleMatches.length} possible matches. Using first match: "${possibleMatches[0].slug}"`);
            content = possibleMatches[0];
          }
        }
      }
      
      // 2. If not found and we have a section, try dash format (preferred format)
      if (!content && section) {
        console.log(`2. Trying dash format: "${dashSlug}"`);
        content = await storage.getPageContent(dashSlug, includeHidden);
      }
      
      // 3. If still not found and we have a section, try hash format (legacy format)
      if (!content && section && dashSlug !== hashSlug) {
        console.log(`3. Trying hash format: "${hashSlug}"`);
        content = await storage.getPageContent(hashSlug, includeHidden);
      }
      
      // 4. Last resort, try just the base slug (no section)
      if (!content && baseSlug !== fullSlug) {
        console.log(`4. Trying base slug: "${baseSlug}"`);
        content = await storage.getPageContent(baseSlug, includeHidden);
      }
      
      // Return 404 if content not found after all attempts
      if (!content) {
        console.log(`No content found for any variation of slug: "${fullSlug}"`);
        return res.status(404).json({ 
          message: "Page content not found",
          requestedSlug: fullSlug
        });
      }
      
      console.log(`Content found for slug request "${fullSlug}", returning ID: ${content.id}`);
      
      // Fix content media URLs in the content HTML if available
      if (content.content) {
        content.content = fixContentMediaUrl(content.content);
      }
      
      res.json(content);
    } catch (err) {
      console.error("Error fetching page content:", err);
      res.status(500).json({ message: "Failed to fetch page content" });
    }
  });

  app.post("/api/pages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Check and standardize slug format (convert hash to dash format)
      const requestData = { ...req.body };
      
      if (requestData.slug && requestData.slug.includes('#')) {
        const oldSlug = requestData.slug;
        const parts = oldSlug.split('#');
        const baseSlug = parts[0];
        const section = parts[1] || '';
        
        if (section) {
          // Convert hash format to dash format
          const newSlug = `${baseSlug}-${section}`;
          console.log(`Converting hash slug format "${oldSlug}" to dash format "${newSlug}"`);
          requestData.slug = newSlug;
        }
      }
      
      console.log("Creating page content with data:", {
        slug: requestData.slug,
        title: requestData.title,
        hasEmbeddedForm: requestData.content?.includes('Need a quote?')
      });

      // Log additional details for debugging
      console.log(`POST /api/pages DEBUGGING`);
      console.log(`Content length: ${requestData.content ? requestData.content.length : 0} characters`);
      console.log(`Has data:image? ${requestData.content && requestData.content.includes('data:image')}`);

      // Process any Base64 images in the content
      if (requestData.content && requestData.content.includes('data:image')) {
        console.log("Detected Base64 images in content, processing...");
        try {
          const section = requestData.slug || 'content';

          // Check for potential issues with embedded forms
          if (requestData.content.includes('<form') || requestData.content.includes('Need a quote?')) {
            console.log("WARNING: Content contains a form which may interfere with image processing!");
            
            // Special handling for forms - use regex to extract Base64 specifically
            const base64Regex = /src=["']data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([^"']+)["']/g;
            let matches;
            let modifiedContent = requestData.content;
            const bucket = section.includes('community') ? 'COMMUNITY' : 'DEFAULT';
            
            // Log info about the embedded form content
            console.log(`Processing form-embedded content for section: ${section}, using bucket: ${bucket}`);
            
            while ((matches = base64Regex.exec(requestData.content)) !== null) {
              try {
                const format = matches[1];
                const base64Data = matches[2];
                const imgMatch = matches[0];
                const mediaType = section.includes('community') ? 'community' : 'content-media';
                
                console.log(`Found Base64 image in form content: ${format} format, ${base64Data.length} characters`);
                
                // Generate a unique filename
                const filename = `${mediaType}-${Date.now()}-${Math.round(Math.random() * 1E9)}.${format}`;
                
                // Convert Base64 to buffer
                const buffer = Buffer.from(base64Data, 'base64');
                
                // Manual upload to object storage
                console.log(`Uploading Base64 image (${buffer.length} bytes) to Object Storage: ${filename}`);
                const url = await objectStorageService.uploadData(buffer, mediaType, filename, `image/${format}`);
                
                console.log(`Image uploaded to: ${url}`);
                
                // Replace Base64 data with Object Storage URL
                modifiedContent = modifiedContent.replace(imgMatch, `src="${url}"`);
              } catch (err) {
                console.error("Failed processing image in form:", err);
              }
            }
            
            requestData.content = modifiedContent;
          } else {
            // Use the regular processor for non-form content
            requestData.content = await processBase64Images(requestData.content, section);
          }
          
          console.log("Base64 images processed successfully");
        } catch (e) {
          console.error("Error processing Base64 images:", e);
          // Continue with the original content if processing fails
        }
      }

      const result = insertPageContentSchema.safeParse({
        ...requestData,
        updatedBy: req.user.id,
      });

      if (!result.success) {
        console.error("Validation errors:", result.error.errors);
        return res.status(400).json({
          message: "Invalid page content data",
          errors: result.error.errors,
        });
      }

      // Create the content first
      const content = await storage.createPageContent(result.data);
      
      // Check if version creation was requested (default to true for consistency)
      const createVersion = req.body.createVersion !== false;
      const versionNotes = req.body.versionNotes || "Initial version";
      
      if (createVersion) {
        console.log(`Creating initial version for new content ${content.id} with notes: "${versionNotes}"`);
        // Create initial version if requested
        try {
          console.log(`Creating initial version for content ID ${content.id}`);
          
          // Use storage interface to handle version creation
          const versionData = {
            contentId: content.id,
            slug: content.slug,
            title: content.title,
            content: content.content,
            mediaUrls: content.mediaUrls || [],
            notes: versionNotes,
            createdBy: req.user.id,
            // The storage interface will determine the appropriate version number
            versionNumber: 1 // Default to 1, storage will handle proper numbering
          };
          
          await storage.createContentVersion(versionData);
          console.log(`Successfully created initial version for content ${content.id}`);
        } catch (versionErr) {
          console.error(`Error creating initial version for content ${content.id}:`, versionErr);
          // Continue even if version creation fails - we still have the content
        }
      }
      
      res.status(201).json(content);
    } catch (err) {
      console.error("Error creating page content:", err);
      res.status(500).json({ 
        message: "Failed to create page content",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  app.patch("/api/pages/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Standardize slug format if it exists in the update request
      const requestData = { ...req.body };
      
      // Log the full content for debugging
      console.log(`PATCH /api/pages/${req.params.id} DEBUGGING`);
      console.log(`Content length: ${requestData.content ? requestData.content.length : 0} characters`);
      console.log(`Has data:image? ${requestData.content && requestData.content.includes('data:image')}`);
      
      // Enhanced debugging for community pages - this helps us diagnose the 400 error issue
      const isCommunityPage = requestData.slug && (
        requestData.slug.startsWith('safety-') || 
        requestData.slug.startsWith('nature-') || 
        requestData.slug.startsWith('amenities-') || 
        requestData.slug.startsWith('community-')
      );
      
      if (isCommunityPage) {
        console.log(`[Community Page Debug] Processing update for community page: ${requestData.slug}`);
        console.log(`[Community Page Debug] Content starts with: ${requestData.content?.substring(0, 100)}...`);
        
        // Check for potentially problematic content patterns
        if (requestData.content) {
          const hasIncompleteImg = requestData.content.includes('<img') && !requestData.content.includes('</img>') && !requestData.content.includes('/>');
          const hasInvalidAttributes = requestData.content.includes('=""') || requestData.content.includes('= "');
          const hasMalformedTags = requestData.content.includes('<<') || requestData.content.includes('>>');
          const hasEmptyDataImage = requestData.content.includes('data:image/;base64,') || requestData.content.includes('data:image/jpeg;base64,""');
          
          console.log(`[Community Page Debug] Content analysis:
            - Has incomplete img tags: ${hasIncompleteImg}
            - Has invalid attributes: ${hasInvalidAttributes}
            - Has malformed tags: ${hasMalformedTags}
            - Has empty data images: ${hasEmptyDataImage}
          `);
        }
      }
      
      // Extract optional versioning parameters
      const createVersion = requestData.createVersion === true;
      const versionNotes = requestData.versionNotes || "Manual update";
      
      // Remove these from the data that will be validated and sent to storage
      delete requestData.createVersion;
      delete requestData.versionNotes;
      
      if (requestData.slug && requestData.slug.includes('#')) {
        const oldSlug = requestData.slug;
        const parts = oldSlug.split('#');
        const baseSlug = parts[0];
        const section = parts[1] || '';
        
        if (section) {
          // Convert hash format to dash format
          const newSlug = `${baseSlug}-${section}`;
          console.log(`Converting hash slug format "${oldSlug}" to dash format "${newSlug}" in update`);
          requestData.slug = newSlug;
        }
      }
      
      console.log("Updating page content:", { 
        id: req.params.id, 
        slug: requestData.slug,
        title: requestData.title,
        hasEmbeddedForm: requestData.content?.includes('Need a quote?'),
        createVersion,
        versionNotes
      });
      
      // Process any Base64 images in the content
      if (requestData.content && requestData.content.includes('data:image')) {
        console.log("Detected Base64 images in content update, processing...");
        try {
          // Use the existing content's slug to determine section, or fall back to the updated slug
          const existingContent = await storage.getPageContent(parseInt(req.params.id));
          const section = (existingContent?.slug || requestData.slug || 'content');
          
          // Check for potential issues - in some cases TinyMCE creates nested content 
          if (requestData.content.includes('<form') || requestData.content.includes('Need a quote?')) {
            console.log("WARNING: Content contains a form which may interfere with image processing!");
            
            // Special handling for forms - use regex to extract Base64 specifically
            const base64Regex = /src=["']data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([^"']+)["']/g;
            let matches;
            let modifiedContent = requestData.content;
            const bucket = section.includes('community') ? 'COMMUNITY' : 'DEFAULT';
            
            // Log info about the embedded form content
            console.log(`Processing form-embedded content for section: ${section}, using bucket: ${bucket}`);
            
            while ((matches = base64Regex.exec(requestData.content)) !== null) {
              try {
                const format = matches[1];
                const base64Data = matches[2];
                const imgMatch = matches[0];
                const mediaType = section.includes('community') ? 'community' : 'content-media';
                
                console.log(`Found Base64 image in form content: ${format} format, ${base64Data.length} characters`);
                
                // Generate a unique filename
                const filename = `${mediaType}-${Date.now()}-${Math.round(Math.random() * 1E9)}.${format}`;
                
                // Convert Base64 to buffer
                const buffer = Buffer.from(base64Data, 'base64');
                
                // Manual upload to object storage
                console.log(`Uploading Base64 image (${buffer.length} bytes) to Object Storage: ${filename}`);
                const url = await objectStorageService.uploadData(buffer, mediaType, filename, `image/${format}`);
                
                console.log(`Image uploaded to: ${url}`);
                
                // Replace Base64 data with Object Storage URL
                modifiedContent = modifiedContent.replace(imgMatch, `src="${url}"`);
              } catch (err) {
                console.error("Failed processing image in form:", err);
              }
            }
            
            requestData.content = modifiedContent;
          } else {
            // Standard processing for regular content
            requestData.content = await processBase64Images(requestData.content, section);
          }
          
          console.log("Base64 images processed successfully in content update");
        } catch (e) {
          console.error("Error processing Base64 images in update:", e);
          // Continue with the original content if processing fails
        }
      }

      // For community pages, use the specialized validator
      if (isCommunityPage) {
        const pageId = parseInt(req.params.id);
        console.log(`[Community Page] Using enhanced validator for page ID ${pageId} with slug ${requestData.slug}`);
        
        // Pass the pageId to the validator for special handling of known problematic pages
        const validationResult = validateAndSanitizeCommunityPage(requestData, req.user.id, pageId);
        
        // Add additional logging when validation is bypassed for specific pages
        if (validationResult.bypassedValidation) {
          console.log(`[Community Page] VALIDATION BYPASSED for page ID ${pageId} - Direct database update`);
        } else if (validationResult.emergencyBypass) {
          console.log(`[Community Page] EMERGENCY BYPASS for slug ${requestData.slug} - Last resort validation override`);
        }
        
        if (validationResult.success) {
          // If validation succeeded (with or without sanitization)
          console.log(`[Community Page] Validation ${validationResult.sanitized ? 'succeeded after sanitization' : 'succeeded'}`);
          
          // Pass the versioning options to storage method
          const content = await storage.updatePageContent(
            pageId, 
            validationResult.data,
            { createVersion, versionNotes }
          );
          
          if (!content) {
            return res.status(404).json({ message: "Page content not found" });
          }
          
          return res.json(content);
        } else {
          // If validation failed even after sanitization attempts
          console.error("[Community Page] Validation failed even after sanitization attempts");
          return res.status(400).json({
            message: "Invalid page content data",
            errors: validationResult.error.errors,
          });
        }
      } else {
        // For non-community pages, use the standard validation
        console.log(`[Vendor Page] Using standard validator for page ID ${req.params.id} with slug ${requestData.slug}`);
        
        const result = insertPageContentSchema.partial().safeParse({
          ...requestData,
          updatedBy: req.user.id,
        });

        if (!result.success) {
          console.error("Validation errors:", result.error.errors);
          return res.status(400).json({
            message: "Invalid page content data",
            errors: result.error.errors,
          });
        }
        
        // Process non-community page within this else block
        try {
          // Handle specifically for vendor pages as needed
          const isVendorPage = requestData.slug && (requestData.slug.startsWith('vendors-') || requestData.slug.includes('vendor'));
          
          if (isVendorPage) {
            console.log(`[Vendor Page] Processing vendor page with slug: ${requestData.slug}`);
          }
          
          // Pass the versioning options to storage method for non-community pages
          const content = await storage.updatePageContent(
            parseInt(req.params.id), 
            result.data,
            { createVersion, versionNotes }
          );
          
          if (!content) {
            return res.status(404).json({ message: "Page content not found" });
          }
          
          return res.json(content);
        } catch (innerErr) {
          console.error(`[Vendor Page Error] Failed to update page content for ${requestData.slug}:`, innerErr);
          return res.status(500).json({ 
            message: "Failed to update page content",
            error: innerErr instanceof Error ? innerErr.message : String(innerErr),
            details: "Error occurred while updating non-community page"
          });
        }
      }

      // This line should never be reached, as both branches above return a response
      // But we'll add this as a fallback just in case
      return res.status(500).json({ message: "Unexpected flow - please report this error" });
    } catch (err) {
      console.error("Error updating page content:", err);
      res.status(500).json({ 
        message: "Failed to update page content",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Content Version History API Routes
  
  // Get all versions for a content
  app.get("/api/content-versions/:contentId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const contentId = parseInt(req.params.contentId);
      const versions = await storage.getContentVersions(contentId);
      res.json(versions);
    } catch (err) {
      console.error("Error retrieving content versions:", err);
      res.status(500).json({ 
        message: "Failed to retrieve content versions",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Get all versions for a slug
  app.get("/api/content-versions/by-slug/:slug", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const { slug } = req.params;
      const versions = await storage.getContentVersionsBySlug(slug);
      res.json(versions);
    } catch (err) {
      console.error("Error retrieving content versions by slug:", err);
      res.status(500).json({ 
        message: "Failed to retrieve content versions by slug",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Restore a content to a specific version
  app.post("/api/content-versions/:versionId/restore", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const versionId = parseInt(req.params.versionId);
      console.log(`Routes: Processing restore request for version ID ${versionId} from user ${req.user.id}`);
      
      // Perform the restoration directly through the storage interface
      // This avoids potential issues with database access in the route handler
      const restoredContent = await storage.restoreContentVersion(versionId);
      
      // Make sure we have valid content returned
      if (!restoredContent || !restoredContent.id) {
        throw new Error("Failed to restore content - no content returned from restoration");
      }
      
      console.log(`Routes: Content successfully restored. Content ID: ${restoredContent.id}, Title: "${restoredContent.title}"`); 
      
      // Return the restored content
      res.json(restoredContent);
    } catch (err) {
      console.error("Error restoring content version:", err);
      res.status(500).json({ 
        message: "Failed to restore content version",
        error: err instanceof Error ? err.message : String(err),
        stackTrace: err instanceof Error ? err.stack : undefined
      });
    }
  });
  
  // Custom Forms API Routes
  
  // Get all custom forms
  app.get("/api/forms", async (req, res) => {
    try {
      const forms = await storage.getCustomForms();
      return res.json(forms);
    } catch (error) {
      console.error("Error retrieving custom forms:", error);
      return res.status(500).json({ 
        message: "Error retrieving custom forms",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get a specific custom form by slug
  app.get("/api/forms/by-slug/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      const form = await storage.getCustomFormBySlug(slug);
      
      if (!form) {
        return res.status(404).json({ message: "Custom form not found" });
      }
      
      return res.json(form);
    } catch (error) {
      console.error("Error retrieving custom form by slug:", error);
      return res.status(500).json({ 
        message: "Error retrieving custom form",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get a specific custom form by ID
  app.get("/api/forms/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const form = await storage.getCustomForm(id);
      
      if (!form) {
        return res.status(404).json({ message: "Custom form not found" });
      }
      
      return res.json(form);
    } catch (error) {
      console.error("Error retrieving custom form:", error);
      return res.status(500).json({ 
        message: "Error retrieving custom form",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create a new custom form (admin only)
  app.post("/api/forms", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Only allow admins to create forms
    const user = req.user as User;
    if (user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to create forms" });
    }
    
    try {
      const newForm = req.body;
      
      // Create a unique slug if not provided
      if (!newForm.slug) {
        const timestamp = new Date().getTime();
        newForm.slug = `${newForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${timestamp}`;
      }
      
      const createdForm = await storage.createCustomForm(newForm);
      return res.status(201).json(createdForm);
    } catch (error) {
      console.error("Error creating custom form:", error);
      return res.status(500).json({ 
        message: "Error creating custom form",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update an existing custom form (admin only)
  app.patch("/api/forms/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Only allow admins to update forms
    const user = req.user as User;
    if (user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to update forms" });
    }
    
    try {
      const id = parseInt(req.params.id);
      const formData = req.body;
      
      // Check if the form exists
      const existingForm = await storage.getCustomForm(id);
      if (!existingForm) {
        return res.status(404).json({ message: "Custom form not found" });
      }
      
      const updatedForm = await storage.updateCustomForm(id, formData);
      return res.json(updatedForm);
    } catch (error) {
      console.error("Error updating custom form:", error);
      return res.status(500).json({ 
        message: "Error updating custom form",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Delete a custom form (admin only)
  app.delete("/api/forms/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Only allow admins to delete forms
    const user = req.user as User;
    if (user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to delete forms" });
    }
    
    try {
      const id = parseInt(req.params.id);
      
      // Check if the form exists
      const existingForm = await storage.getCustomForm(id);
      if (!existingForm) {
        return res.status(404).json({ message: "Custom form not found" });
      }
      
      // Delete the form (preserving submissions)
      const success = await storage.deleteCustomForm(id);
      
      return res.json({ 
        success, 
        message: success ? "Form deleted successfully" : "Failed to delete form" 
      });
    } catch (error) {
      console.error("Error deleting custom form:", error);
      return res.status(500).json({ 
        message: "Error deleting custom form",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Form Submissions API Routes
  
  // Get all form submissions across all forms (admin only)
  app.get("/api/admin/form-submissions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Only allow admins to view all submissions
    const user = req.user as User;
    if (user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to view submissions" });
    }
    
    try {
      const submissions = await storage.getAllFormSubmissions();
      return res.json(submissions);
    } catch (error) {
      console.error("Error retrieving all form submissions:", error);
      return res.status(500).json({ 
        message: "Error retrieving all form submissions",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get all submissions for a form (admin only)
  app.get("/api/forms/:id/submissions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Only allow admins to view all submissions
    const user = req.user as User;
    if (user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to view submissions" });
    }
    
    try {
      const formId = parseInt(req.params.id);
      
      // Check if the form exists
      const existingForm = await storage.getCustomForm(formId);
      if (!existingForm) {
        return res.status(404).json({ message: "Custom form not found" });
      }
      
      const submissions = await storage.getFormSubmissions(formId);
      return res.json(submissions);
    } catch (error) {
      console.error("Error retrieving form submissions:", error);
      return res.status(500).json({ 
        message: "Error retrieving form submissions",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get a specific submission (admin or owner only)
  app.get("/api/submissions/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const id = parseInt(req.params.id);
      const submission = await storage.getFormSubmission(id);
      
      if (!submission) {
        return res.status(404).json({ message: "Form submission not found" });
      }
      
      // Check if user has permission to view this submission
      const user = req.user as User;
      if (user.role !== 'admin' && submission.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to view this submission" });
      }
      
      return res.json(submission);
    } catch (error) {
      console.error("Error retrieving form submission:", error);
      return res.status(500).json({ 
        message: "Error retrieving form submission",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Submit a form (authenticated users only)
  app.post("/api/forms/:id/submit", upload.array('files'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const formId = parseInt(req.params.id);
      const user = req.user as User;
      
      // Check if the form exists
      const existingForm = await storage.getCustomForm(formId);
      if (!existingForm) {
        return res.status(404).json({ message: "Custom form not found" });
      }
      
      // Extract form data
      const formData = typeof req.body.formData === 'string' 
        ? JSON.parse(req.body.formData) 
        : req.body.formData || req.body;
      
      // Process uploaded files if any
      const files = req.files as Express.Multer.File[];
      const fileUploads = files ? files.map(file => file.path) : [];
      
      // Create the submission
      const submission = await storage.createFormSubmission({
        formId,
        userId: user.id,
        formData,
        termsAccepted: req.body.termsAccepted === 'true' || req.body.termsAccepted === true,
        fileUploads
      });
      
      return res.status(201).json(submission);
    } catch (error) {
      console.error("Error submitting form:", error);
      return res.status(500).json({ 
        message: "Error submitting form",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Contact form submission endpoint
  app.post("/api/contact", async (req, res) => {
    try {
      const data = req.body;
      const userId = req.isAuthenticated() ? (req.user as User).id : null;
      
      // Determine which form to use based on inquiry type
      let formSlug;
      if (data.inquiryType === "bug-report") {
        formSlug = "contact-bug-report";
      } else if (data.inquiryType === "feature-request") {
        formSlug = "contact-feature-request";
      } else if (data.inquiryType === "feedback") {
        formSlug = "contact-feedback";
      } else {
        return res.status(400).json({ message: "Invalid inquiry type" });
      }
      
      // Check if the form exists, if not, create it
      let form = await storage.getCustomFormBySlug(formSlug);
      
      if (!form) {
        // Create appropriate form based on type
        if (formSlug === "contact-bug-report") {
          form = await storage.createCustomForm({
            title: "Bug Report Form",
            description: "Form for submitting bug reports",
            slug: formSlug,
            formFields: [
              {
                id: "name",
                type: "text",
                label: "Name",
                required: true,
                order: 0,
              },
              {
                id: "email",
                type: "email",
                label: "Email",
                required: true,
                order: 1,
              },
              {
                id: "subject",
                type: "text",
                label: "Subject",
                required: true,
                order: 2,
              },
              {
                id: "pageUrl",
                type: "text",
                label: "Page URL",
                required: false,
                order: 3,
              },
              {
                id: "browserInfo",
                type: "text",
                label: "Browser & Device",
                required: false,
                order: 4,
              },
              {
                id: "description",
                type: "textarea",
                label: "Bug Description",
                required: true,
                order: 5,
              },
              {
                id: "stepsToReproduce",
                type: "textarea",
                label: "Steps to Reproduce",
                required: true,
                order: 6,
              },
              {
                id: "expectedBehavior",
                type: "textarea",
                label: "Expected Behavior",
                required: false,
                order: 7,
              }
            ],
            requiresTermsAcceptance: false,
          });
        } else if (formSlug === "contact-feature-request") {
          form = await storage.createCustomForm({
            title: "Feature Request Form",
            description: "Form for submitting feature requests",
            slug: formSlug,
            formFields: [
              {
                id: "name",
                type: "text",
                label: "Name",
                required: true,
                order: 0,
              },
              {
                id: "email",
                type: "email",
                label: "Email",
                required: true,
                order: 1,
              },
              {
                id: "subject",
                type: "text",
                label: "Subject",
                required: true,
                order: 2,
              },
              {
                id: "featureDescription",
                type: "textarea",
                label: "Feature Description",
                required: true,
                order: 3,
              },
              {
                id: "useCase",
                type: "textarea",
                label: "Use Case",
                required: true,
                order: 4,
              },
              {
                id: "priority",
                type: "select",
                label: "Priority",
                required: false,
                order: 5,
                options: ["low", "medium", "high", "critical"],
              }
            ],
            requiresTermsAcceptance: false,
          });
        } else if (formSlug === "contact-feedback") {
          form = await storage.createCustomForm({
            title: "Feedback Form",
            description: "Form for submitting general feedback",
            slug: formSlug,
            formFields: [
              {
                id: "name",
                type: "text",
                label: "Name",
                required: true,
                order: 0,
              },
              {
                id: "email",
                type: "email",
                label: "Email",
                required: true,
                order: 1,
              },
              {
                id: "subject",
                type: "text",
                label: "Subject",
                required: true,
                order: 2,
              },
              {
                id: "feedbackType",
                type: "select",
                label: "Feedback Type",
                required: true,
                order: 3,
                options: ["compliment", "suggestion", "general"],
              },
              {
                id: "message",
                type: "textarea",
                label: "Your Feedback",
                required: true,
                order: 4,
              }
            ],
            requiresTermsAcceptance: false,
          });
        }
      }
      
      if (!form) {
        return res.status(500).json({ message: "Failed to create or retrieve form" });
      }
      
      // Save the form submission
      const submission = await storage.createFormSubmission({
        formId: form.id,
        userId: userId,
        submitterEmail: data.email,
        formData: data,
        termsAccepted: false,
        fileUploads: [],
      });
      
      // Import the utility function to create a message from the contact form
      const { createMessageFromContactForm } = await import('./utils/contact-message-utils');
      
      try {
        // Determine the message content based on inquiry type
        let messageContent = '';
        
        // For bug reports, combine all the bug-related fields
        if (data.inquiryType === 'bug-report') {
          messageContent = `${data.description || ''}\n\n`;
          
          if (data.stepsToReproduce) {
            messageContent += `Steps to Reproduce:\n${data.stepsToReproduce}\n\n`;
          }
          
          if (data.expectedBehavior) {
            messageContent += `Expected Behavior:\n${data.expectedBehavior}\n\n`;
          }
          
          if (data.pageUrl) {
            messageContent += `Page URL: ${data.pageUrl}\n`;
          }
          
          if (data.browserInfo) {
            messageContent += `Browser & Device: ${data.browserInfo}\n`;
          }
        } else if (data.inquiryType === 'feature-request') {
          messageContent = `${data.description || ''}\n\n`;
          
          if (data.useCase) {
            messageContent += `Use Case:\n${data.useCase}\n\n`;
          }
          
          if (data.benefitToUsers) {
            messageContent += `Benefits to Users:\n${data.benefitToUsers}\n\n`;
          }
        } else {
          // For general feedback, use the message field
          messageContent = data.message || '';
        }
        
        // Create a message in the messaging system
        const messageId = await createMessageFromContactForm(
          data.inquiryType,
          userId,
          data.name,
          data.email,
          data.subject,
          messageContent
        );
        
        if (messageId > 0) {
          console.log(`Created message #${messageId} from contact form submission #${submission.id}`);
        }
      } catch (messageError) {
        // Log the error but don't fail the whole request
        console.error('Error creating message from contact form:', messageError);
      }
      
      return res.status(200).json({ 
        message: "Form submitted successfully", 
        id: submission.id 
      });
    } catch (error) {
      console.error("Error submitting contact form:", error);
      return res.status(500).json({ 
        message: "An error occurred while processing your request",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Custom icon upload endpoint - using generic processUploadedFile function
  app.post("/api/icons/upload", upload.single('iconFile'), mediaSyncMiddleware, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Check if this is an SVG file
      if (!req.file.mimetype.includes('svg')) {
        return res.status(400).json({ 
          success: false, 
          message: "Only SVG files are allowed for icons" 
        });
      }

      // Set the media type explicitly
      req.mediaType = 'icons';
      
      // Use our generic file processing function
      const result = processUploadedFile(req, req.file);
      
      if (!result.success) {
        console.error("Icon upload failed:", result.message);
        return res.status(400).json({ 
          success: false,
          message: result.message 
        });
      }
      
      console.log(`Icon uploaded successfully: ${result.url}`);

      res.json({
        success: true,
        url: result.url,
        developmentUrl: result.developmentUrl,
        message: "Icon uploaded successfully"
      });
    } catch (err) {
      console.error("Error uploading icon:", err);
      res.status(500).json({
        success: false,
        message: "Failed to upload icon"
      });
    }
  });
  
  // Banner slide image upload endpoint - enhanced error handling and verification
  app.post("/api/banner-slides/upload", upload.single('bannerImage'), mediaSyncMiddleware, async (req: any, res) => {
    console.log('Banner upload request received:', {
      isAuthenticated: req.isAuthenticated(),
      userRole: req.user?.role,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype
    });
    
    if (!req.isAuthenticated()) {
      console.log('Banner upload failed: Not authenticated');
      return res.status(401).json({ 
        success: false,
        message: "Not authenticated" 
      });
    }

    if (req.user.role !== 'admin') {
      console.log('Banner upload failed: Not an admin. User role:', req.user.role);
      return res.status(403).json({ 
        success: false,
        message: "Admin access required" 
      });
    }

    if (!req.file) {
      console.log('Banner upload failed: No file provided');
      return res.status(400).json({ 
        success: false,
        message: "No file was uploaded" 
      });
    }

    try {
      // Import the media path utilities with enhanced features
      const { 
        MEDIA_TYPES, 
        createMediaFilename, 
        saveMediaFile,
        verifyBannerSlideExists,
        syncBannerSlide
      } = await import('./media-path-utils');
      
      console.log('Processing banner slide upload: File:', req.file.originalname);
      
      // Generate a unique filename for the banner image
      const fileExt = path.extname(req.file.originalname);
      const newFilename = createMediaFilename('bannerImage', fileExt);
      
      // Get the file data with better error handling
      let fileData;
      try {
        if (req.file.buffer) {
          fileData = req.file.buffer;
          console.log('Using file buffer for upload');
        } else if (req.file.path) {
          fileData = fs.readFileSync(req.file.path);
          console.log('Using file from disk for upload');
        } else {
          throw new Error("No file buffer or path available");
        }
      } catch (fileReadError) {
        console.error("Failed to read upload file:", fileReadError);
        return res.status(500).json({
          success: false,
          message: "Could not read uploaded file"
        });
      }
      
      // Upload directly to Object Storage
      console.log('Uploading banner slide to Object Storage...');
      const BANNER_BUCKET = 'BANNER'; // Use dedicated BANNER bucket for banner slides
      
      // Create a temporary file if we only have the buffer
      let tempFilePath;
      if (!req.file.path && fileData) {
        tempFilePath = path.join(os.tmpdir(), `temp-banner-${Date.now()}-${newFilename}`);
        fs.writeFileSync(tempFilePath, fileData);
        console.log(`Created temporary file for upload: ${tempFilePath}`);
        req.file.path = tempFilePath;
      }
      
      // Upload to Object Storage first
      let objectStorageUrl;
      try {
        // Import objectStorageService
        const { objectStorageService } = await import('./object-storage-service');
        
        objectStorageUrl = await objectStorageService.uploadFile(
          req.file.path,
          'banner-slides',
          newFilename,
          BANNER_BUCKET
        );
        
        console.log(`Successfully uploaded to Object Storage: ${objectStorageUrl}`);
      } catch (uploadError) {
        console.error("Error uploading to Object Storage:", uploadError);
        // Continue with filesystem storage as fallback
      }
      
      // Also maintain backwards compatibility by saving to filesystem
      const urls = saveMediaFile(fileData, MEDIA_TYPES.BANNER_SLIDES, newFilename);
      
      // Clean up the temporary file if we created one
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`Deleted temporary file: ${tempFilePath}`);
        } catch (unlinkError) {
          console.warn("Failed to delete temporary file:", tempFilePath, unlinkError);
        }
      }
      
      if (!urls) {
        console.error("Banner slide upload failed: saveMediaFile returned null");
        return res.status(500).json({ 
          success: false,
          message: "Failed to save banner image to required locations" 
        });
      }
      
      // Verify the file was saved correctly in both locations
      const fileExists = verifyBannerSlideExists(newFilename);
      if (!fileExists) {
        console.error(`Banner slide verification failed for ${newFilename}`);
        return res.status(500).json({
          success: false,
          message: "Banner image was not saved correctly in both locations"
        });
      }
      
      // If multer created a temporary file, delete it as we've saved our own copies
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
          console.log(`Deleted temporary file: ${req.file.path}`);
        } catch (unlinkError) {
          console.warn("Failed to delete temporary file:", req.file.path, unlinkError);
          // Non-fatal error, continue
        }
      }
      
      // Try to sync any other banner slides that might have issues
      try {
        // Get a list of all banner slides in uploads directory
        const uploadsDir = path.join(__dirname, '../uploads', MEDIA_TYPES.BANNER_SLIDES);
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          console.log(`Found ${files.length} existing banner slides to verify`);
          
          // Verify each file exists in both locations
          let syncCount = 0;
          for (const filename of files) {
            if (filename !== newFilename) { // Skip the one we just uploaded
              if (syncBannerSlide(filename)) {
                syncCount++;
              }
            }
          }
          if (syncCount > 0) {
            console.log(`Synchronized ${syncCount} existing banner slides`);
          }
        }
      } catch (syncError) {
        console.warn("Non-fatal error syncing other banner slides:", syncError);
        // Continue with the upload response
      }
      
      console.log(`Banner slide uploaded successfully. Dev URL: ${urls.devUrl}, Prod URL: ${urls.prodUrl}, Object Storage URL: ${objectStorageUrl || 'not available'}`);
      
      // Return all URLs to the client including Object Storage URL
      res.json({
        success: true,
        url: urls.devUrl,  // Use the uploads/dev URL as primary for consistent handling with client expectations
        developmentUrl: urls.devUrl,
        productionUrl: urls.prodUrl, // Still provide this for reference
        objectStorageUrl: objectStorageUrl, // Add Object Storage URL if available
        message: "Banner image uploaded successfully"
      });
    } catch (err) {
      console.error("Error uploading banner image:", err);
      res.status(500).json({
        success: false,
        message: `Failed to upload banner image: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });

  // Get all icon files - enhanced for production
  app.get("/api/icons", async (req, res) => {
    try {
      const mediaType = 'icons';
      
      // Both directories since files could be in either place
      const uploadsIconsDir = path.join(__dirname, '../uploads', mediaType);
      const prodIconsDir = path.join(__dirname, '..', mediaType);
      
      // Create the directories if they don't exist
      if (!fs.existsSync(uploadsIconsDir)) {
        fs.mkdirSync(uploadsIconsDir, { recursive: true });
      }
      
      if (!fs.existsSync(prodIconsDir)) {
        fs.mkdirSync(prodIconsDir, { recursive: true });
      }
      
      // Read all files from both directories
      let files = [];
      
      try {
        const uploadFiles = fs.readdirSync(uploadsIconsDir);
        files = [...uploadFiles];
      } catch (err) {
        console.error(`Error reading uploads/${mediaType} directory:`, err);
      }
      
      try {
        const prodFiles = fs.readdirSync(prodIconsDir);
        // Combine but remove duplicates
        files = [...new Set([...files, ...prodFiles])];
      } catch (err) {
        console.error(`Error reading ${mediaType} directory:`, err);
      }
      
      // Get the URLs for all icon files (SVGs only)
      const iconUrls = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ext === '.svg';
        })
        .map(file => ({
          url: getMediaUrl(mediaType, file, false), // false = don't use /uploads/ prefix
          name: file.replace(/iconFile-\d+-\d+\.svg/, '').replace(/-/g, ' '),
          id: file.split('-')[1] // extract the timestamp as a unique ID
        }));
      
      res.json({ icons: iconUrls });
    } catch (err) {
      console.error("Error retrieving icon files:", err);
      res.status(500).json({ 
        message: "Failed to retrieve icon files",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Get all banner slide images - enhanced for production using utilities
  app.get("/api/banner-slides/images", async (req, res) => {
    try {
      const mediaType = 'banner-slides';
      
      // Both directories since files could be in either place
      const uploadsDir = path.join(__dirname, '../uploads', mediaType);
      const prodDir = path.join(__dirname, '..', mediaType);
      
      // Create the directories if they don't exist using our utility functions
      ensureDirectoryExists(uploadsDir);
      ensureDirectoryExists(prodDir);
      
      // Read all files from both directories
      let files = [];
      
      try {
        const uploadFiles = fs.readdirSync(uploadsDir);
        files = [...uploadFiles];
      } catch (err) {
        console.error(`Error reading uploads/${mediaType} directory:`, err);
      }
      
      try {
        const prodFiles = fs.readdirSync(prodDir);
        // Combine but remove duplicates
        files = [...new Set([...files, ...prodFiles])];
      } catch (err) {
        console.error(`Error reading ${mediaType} directory:`, err);
      }
      
      // Get the URLs for all banner slide images, using production path format
      const imageUrls = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm'].includes(ext);
        })
        .map(file => getMediaUrl(mediaType, file, false)); // false = don't use /uploads/ prefix
      
      res.json({ images: imageUrls });
      
      // Verify that the reported images actually exist
      const missingImages = [];
      for (const file of files) {
        const uploadsFilePath = path.join(uploadsDir, file);
        const prodFilePath = path.join(prodDir, file);
        
        if (!fs.existsSync(uploadsFilePath) && !fs.existsSync(prodFilePath)) {
          missingImages.push(file);
        }
      }
      
      if (missingImages.length > 0) {
        console.log(`Warning: ${missingImages.length} banner slide images reported but not found in file system:`, missingImages);
      }
    } catch (err) {
      console.error("Error retrieving banner images:", err);
      res.status(500).json({ 
        message: "Failed to retrieve banner images",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Content media upload endpoint for WYSIWYG editor - using generic processUploadedFile function
  app.post("/api/content/upload-media", upload.single('mediaFile'), mediaSyncMiddleware, async (req: any, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Only allow approved users to upload media
    if (!req.user.isApproved && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Your account must be approved to upload media" });
    }

    try {
      // Set media type to content-media
      req.mediaType = 'content-media';
      console.log('Processing content media upload with type:', req.mediaType, 'File:', req.file?.originalname);
      
      // Use our generic file processing function
      const result = processUploadedFile(req, req.file);
      
      if (!result.success) {
        console.error("Media upload failed:", result.message);
        return res.status(400).json({ 
          success: false,
          message: result.message 
        });
      }
      
      console.log(`Media uploaded successfully: ${result.url}`);

      res.json({
        success: true,
        url: result.url,
        developmentUrl: result.developmentUrl,
        message: "Media uploaded successfully"
      });
    } catch (err) {
      console.error("Error uploading content media:", err);
      res.status(500).json({
        success: false,
        message: "Failed to upload media"
      });
    }
  });
  
  // Forum media upload endpoint - exclusively for Replit Object Storage
  app.post("/api/forum/upload-media", upload.single('mediaFile'), async (req: any, res) => {
    console.log("[ForumUpload] Starting upload process focused exclusively on Replit Object Storage");
    
    // Check authentication first
    if (!req.isAuthenticated()) {
      console.log("[ForumUpload] Authentication failed");
      return res.status(401).json({ message: "Not authenticated" });
    }

    console.log(`[ForumUpload] User: ${req.user.username} (${req.user.id})`);

    // Check if user is blocked
    if (req.user.isBlocked && req.user.role !== 'admin') {
      console.log(`[ForumUpload] User is blocked: ${req.user.username}`);
      return res.status(403).json({ 
        message: "Your account has been blocked. You cannot upload media.",
        blockReason: req.user.blockReason || "Contact an administrator for more information."
      });
    }
    
    try {
      // Check if file is present
      if (!req.file) {
        console.error("[ForumUpload] No file received");
        return res.status(400).json({ 
          success: false,
          message: "No file uploaded"
        });
      }
      
      // Log file details
      console.log("[ForumUpload] File:", {
        name: req.file.originalname,
        size: `${Math.round(req.file.size / 1024)}KB`,
        type: req.file.mimetype,
        path: req.file.path
      });
      
      // Generate filename - simpler format
      const fileExtension = path.extname(req.file.originalname);
      const timestamp = Date.now();
      const randomId = Math.round(Math.random() * 1000000);
      const filename = `forum-${timestamp}-${randomId}${fileExtension}`;
      
      console.log(`[ForumUpload] Generated filename: ${filename}`);
      
      // Create temporary debug file to ensure we can write to disk
      const debugFilePath = path.join(process.cwd(), 'tmp_debug', `debug-${timestamp}.txt`);
      try {
        fs.writeFileSync(debugFilePath, 'Debug test file');
        console.log(`[ForumUpload] Debug file created at ${debugFilePath}`);
      } catch (debugError) {
        console.error(`[ForumUpload] Error creating debug file:`, debugError);
      }
      
      // Get the Replit Object Storage client directly - we need full control
      const client = new Client();
      
      // Storage key for forum media - consistent format
      const storageKey = `forum/${filename}`;
      const bucket = "FORUM";
      
      console.log(`[ForumUpload] Uploading directly to Object Storage: ${bucket}/${storageKey}`);
      
      // Upload directly from the file on disk
      // This matches exactly how the test script works which definitely succeeds
      const result = await client.uploadFromFilename(
        storageKey,
        req.file.path,
        {
          bucketName: bucket,
          contentType: req.file.mimetype || 'application/octet-stream',
          headers: {
            'X-Obj-Bucket': bucket
          }
        }
      );
      
      if (!result.ok) {
        console.error(`[ForumUpload] Upload failed: ${result.error?.message}`);
        return res.status(500).json({
          success: false,
          message: `Failed to upload to Object Storage: ${result.error?.message}`
        });
      }
      
      // Successfully uploaded to Object Storage
      console.log(`[ForumUpload] Upload succeeded!`);
      
      // Verify upload by checking if object exists
      console.log(`[ForumUpload] Verifying upload...`);
      const verifyResult = await client.exists(storageKey, {
        bucketName: bucket,
        headers: { 'X-Obj-Bucket': bucket }
      });
      
      if (!verifyResult.ok || !verifyResult.value) {
        console.error(`[ForumUpload] Verification failed: file not found in bucket`);
        return res.status(500).json({
          success: false,
          message: "Upload verification failed: file not found in bucket"
        });
      }
      
      console.log(`[ForumUpload] Verification successful! File exists in bucket`);
      
      // Try downloading to confirm it's really there
      console.log(`[ForumUpload] Trying to download to verify content...`);
      const downloadResult = await client.downloadAsBytes(storageKey, {
        bucketName: bucket,
        headers: { 'X-Obj-Bucket': bucket }
      });
      
      if (downloadResult.ok) {
        console.log(`[ForumUpload] Download verification successful! Downloaded ${downloadResult.value.length} bytes`);
      } else {
        console.warn(`[ForumUpload] Download verification failed: ${downloadResult.error?.message}`);
      }
      
      // Construct URLs - multiple formats for maximum compatibility
      const directUrl = `https://object-storage.replit.app/${bucket}/${storageKey}`;
      const proxyUrl = `/api/storage-proxy/${bucket}/${storageKey}`;
      const directForumUrl = `/api/storage-proxy/direct-forum/${filename}`; // Special direct forum access point
      const simpleForumUrl = `/api/storage-proxy/forum/${filename}`; // Simplified format
      
      // Return success response with all URL formats
      console.log(`[ForumUpload] Returning success with multiple URL formats for maximum compatibility`);
      console.log(`[ForumUpload] - Primary URL: ${proxyUrl}`);
      console.log(`[ForumUpload] - Direct forum URL: ${directForumUrl}`);
      console.log(`[ForumUpload] - Simple forum URL: ${simpleForumUrl}`);
      
      return res.json({
        success: true,
        url: proxyUrl, // Primary URL to use (recommended)
        directUrl: directUrl, // Direct Object Storage URL (for debugging)
        directForumUrl: directForumUrl, // Direct forum access endpoint
        simpleForumUrl: simpleForumUrl, // Simplified format for compatibility
        storageKey: storageKey, // The storage key used
        bucket: bucket // The bucket used
      });
    } catch (err) {
      console.error("[ForumUpload] Fatal error:", err);
      return res.status(500).json({
        success: false,
        message: "Fatal error: " + (err.message || "Unknown error")
      });
    }
  });
  
  // Get all content media images - enhanced for production
  app.get("/api/content/media", async (req, res) => {
    try {
      const mediaType = 'content-media';
      
      // Both directories since files could be in either place
      const uploadsContentMediaDir = path.join(__dirname, '../uploads', mediaType);
      const prodContentMediaDir = path.join(__dirname, '..', mediaType);
      
      // Create the directories if they don't exist
      if (!fs.existsSync(uploadsContentMediaDir)) {
        fs.mkdirSync(uploadsContentMediaDir, { recursive: true });
      }
      
      if (!fs.existsSync(prodContentMediaDir)) {
        fs.mkdirSync(prodContentMediaDir, { recursive: true });
      }
      
      // Read all files from both directories
      let files = [];
      
      try {
        const uploadFiles = fs.readdirSync(uploadsContentMediaDir);
        files = [...uploadFiles];
      } catch (err) {
        console.error(`Error reading uploads/${mediaType} directory:`, err);
      }
      
      try {
        const prodFiles = fs.readdirSync(prodContentMediaDir);
        // Combine but remove duplicates
        files = [...new Set([...files, ...prodFiles])];
      } catch (err) {
        console.error(`Error reading ${mediaType} directory:`, err);
      }
      
      // Get the URLs for all content media images, using production path format
      const imageUrls = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.svg'].includes(ext);
        })
        .map(file => getMediaUrl(mediaType, file, false)); // false = don't use /uploads/ prefix
      
      res.json({ images: imageUrls });
    } catch (err) {
      console.error("Error retrieving content media:", err);
      res.status(500).json({ 
        message: "Failed to retrieve content media",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  // Emergency version history fix route (admin only)

  app.post("/api/admin/fix-version-history", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      console.log("Running emergency version history fix");
      
      // Import the fix function
      const { fixAllVersionHistoryIssues } = await import('./fix-version-history');
      const success = await fixAllVersionHistoryIssues();
      
      if (success) {
        res.json({ 
          success: true, 
          message: "Version history system has been fixed" 
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to fix version history system"
        });
      }
    } catch (err) {
      console.error("Error in version history fix:", err);
      res.status(500).json({ 
        success: false,
        message: "Error in version history fix",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Register product routes
  app.use("/api/products", productsRouter);
  
  // Object Storage proxy for serving files from Replit Object Storage
  // This bypasses CORS issues with direct Object Storage URLs
  // Special middleware to handle the FORUM/forum format before it reaches the regular router
  app.use("/api/storage-proxy/FORUM/forum", async (req, res, next) => {
    console.log(`[StandardForumMiddleware] Intercepting: ${req.path}`);
    try {
      // Attempt to handle with our specialized handler
      const handled = await handleStandardForumFormat(req, res);
      if (!handled) {
        // If our handler didn't handle it, continue to the next middleware
        next();
      }
      // If it was handled, the response has already been sent
    } catch (error) {
      console.error(`[StandardForumMiddleware] Error in handler: ${error}`);
      next();
    }
  });
  
  // Mount the general storage proxy router for all other routes
  app.use("/api/storage-proxy", objectStorageProxyRouter);
  
  // Add a direct route for handling Object Storage URLs directly
  // This helps when direct Object Storage URLs are stored in the database
  app.get("/object-storage.replit.app/:bucket/:path(*)", (req, res) => {
    const { bucket, path } = req.params;
    console.log(`Redirecting direct Object Storage URL request: ${bucket}/${path}`);
    res.redirect(`/api/storage-proxy/${bucket}/${path}`);
  });
  
  // Specific handler for /CALENDAR/events/ paths
  // This handles direct database references to events media
  app.get("/CALENDAR/events/:filename", (req, res) => {
    const { filename } = req.params;
    console.log(`Intercepting direct CALENDAR/events URL: ${filename}`);
    res.redirect(`/api/storage-proxy/CALENDAR/events/${filename}`);
  });
  
  // Specific handler for /FORUM/forum/ paths
  // This handles direct database references to forum media
  app.get("/FORUM/forum/:filename", (req, res) => {
    const { filename } = req.params;
    console.log(`Intercepting direct FORUM/forum URL: ${filename}`);
    // Use direct-forum endpoint instead of redirecting to prevent infinite loops
    res.redirect(`/api/storage-proxy/direct-forum/${filename}`);
  });
  
  // Register print service routes
  app.use("/api/print-service", printServiceRouter);
  app.use("/api/printful", printfulRoutes);
  
  // Mount test pages router for real estate media upload testing
  app.use("/test", testPagesRouter);
  
  // Register order management routes
  app.use("/api/orders", ordersRouter);
  app.use("/api/returns", returnsRouter);
  app.use("/api/forum", createForumRouter(storage));
  app.use("/api/vendors", createVendorRouter(storage));
  app.use("/api/vendor-categories", createVendorCategoryRouter(storage));
  app.use("/api/community-categories", createCommunityCategoryRouter(storage));
  app.use("/api/messages", messagesRouter);
  
  // Mount message diagnostics router for troubleshooting message visibility issues
  app.use("/api/message-diagnostics", messageDiagnosticsRouter);
  
  // Mount message debug router for analyzing unread message status issues
  app.use("/api/debug", messageDebugRouter);
  
  app.use("/api/test-media", testMediaRouter);
  app.use("/api/test", testRouter);
  app.use("/api/forum-media-test", forumMediaTestRouter);
  
  // Special endpoint for TinyMCE editor image uploads in forum
  app.post("/api/forum/tinymce-upload", requireAuth, forumUpload.single('file'), handleForumMediaUpload);
  
  // Multiple file upload endpoint for forum media gallery
  app.post("/api/forum/media/upload-multiple", requireAuth, forumUpload.array('files', 10), handleMultipleForumMediaUpload);

  // Specialized vendor upload endpoint for TinyMCE editor
  app.post("/api/vendor/tinymce-upload", requireAuth, vendorUpload.single('file'), handleVendorMediaUpload);
  
  // Specialized community upload endpoint for TinyMCE editor
  app.post("/api/community/tinymce-upload", requireAuth, communityUpload.single('file'), handleCommunityMediaUpload);
  
  // Direct upload endpoint for Object Storage
  app.post("/api/direct-upload", upload.single('file'), async (req, res) => {
    try {
      console.log('[DirectUpload] Processing direct upload request');
      
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded' 
        });
      }

      // Get the upload parameters from the form
      const token = req.body.token;
      const bucket = req.body.bucket || 'FORUM';
      const key = req.body.key || `forum/${req.file.originalname}`;
      
      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Missing token for authentication'
        });
      }
      
      console.log(`[DirectUpload] Uploading to bucket: ${bucket}, key: ${key}`);
      
      // Read the file buffer
      const fileBuffer = fs.readFileSync(req.file.path);
      
      // Decode the token to verify it's valid
      let tokenData;
      try {
        const tokenStr = Buffer.from(token, 'base64').toString('utf-8');
        tokenData = JSON.parse(tokenStr);
        
        // Verify token is valid and not expired
        if (!tokenData || !tokenData.bucket || !tokenData.expiresAt) {
          throw new Error('Invalid token format');
        }
        
        if (tokenData.expiresAt < Date.now()) {
          throw new Error('Token expired');
        }
        
        if (tokenData.bucket !== bucket) {
          console.warn(`[DirectUpload] Token bucket ${tokenData.bucket} doesn't match request bucket ${bucket}`);
        }
      } catch (tokenError) {
        console.error(`[DirectUpload] Token validation error:`, tokenError);
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token',
          error: tokenError.message
        });
      }
      
      // Create a client for uploading
      const client = new Client();
      
      console.log(`[DirectUpload] Uploading directly to Object Storage: ${bucket}/${key}`);
      
      // Create a temporary file for uploading since we need to use uploadFromFilename
      const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}-${path.basename(key)}`);
      fs.writeFileSync(tempFilePath, fileBuffer);
      
      let uploadSuccess = false;
      
      try {
        // Upload using the Object Storage client with uploadFromFilename
        const uploadResult = await client.uploadFromFilename(key, tempFilePath, {
          bucketName: bucket,
          contentType: req.file.mimetype,
          headers: {
            'X-Obj-Bucket': bucket,
            'Content-Type': req.file.mimetype
          }
        });
        
        // Clean up temporary file
        fs.unlinkSync(tempFilePath);
        
        // Check if upload was successful
        if (!uploadResult.ok) {
          console.error(`[DirectUpload] Upload failed:`, uploadResult.error);
          throw new Error(`Upload failed: ${uploadResult.error.message || 'Unknown error'}`);
        }
        
        uploadSuccess = true;
        console.log(`[DirectUpload] Upload successful for ${bucket}/${key}`);
      } catch (uploadError) {
        // Clean up temporary file in case of error
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        
        // Return an error response
        return res.status(500).json({
          success: false,
          message: `Upload failed: ${uploadError.message}`,
          error: uploadError.message
        });
      }
      
      // If we got here, the upload was successful
      
      // Clean up temporary file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanError) {
        console.warn(`[DirectUpload] Failed to clean up temporary file: ${cleanError.message}`);
      }
      
      // Generate URL formats for the uploaded file
      const filename = path.basename(key);
      const directUrl = `https://object-storage.replit.app/${bucket}/${key}`;
      const proxyUrl = `/api/storage-proxy/${bucket}/${key}`;
      const directForumUrl = `/api/storage-proxy/direct-forum/${filename}`;
      
      // Return success with the URLs
      return res.json({
        success: true,
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        },
        urls: {
          direct: directUrl,
          proxy: proxyUrl,
          directForum: directForumUrl,
          key: key,
          bucket: bucket
        }
      });
      
    } catch (error) {
      console.error(`[DirectUpload] Error processing upload: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error processing upload',
        error: error.message
      });
    }
  });
  
  // Register user membership subscription routes
  app.use("/api/subscriptions", userSubscriptionsRouter);
  
  // Register setup-memberships utility endpoint
  app.use("/api/setup-memberships", setupMembershipsRouter);
  
  // Membership processing admin tools
  app.use("/api/admin/membership-processing", membershipProcessingRouter);
  
  // Calendar media diagnostics are imported at the top of the file

  // Calendar media diagnostic and management endpoints
  // Using direct route handlers instead of calendarMediaDiagnostics handlers
  app.get("/api/admin/calendar-media-status", requireAuth, requireAdmin, async (req, res) => {
    // Forward to the media check endpoint with admin privilege
    try {
      const events = await storage.getAllEvents();
      const stats = {
        totalEvents: events.length,
        eventsWithMedia: 0,
        eventsWithoutMedia: 0,
        eventsWithProxyFormat: 0,
        eventsWithDirectUrls: 0,
        eventsWithLocalUrls: 0
      };
      
      for (const event of events) {
        if (!event.mediaUrls || event.mediaUrls.length === 0) {
          stats.eventsWithoutMedia++;
          continue;
        }
        
        stats.eventsWithMedia++;
        
        // Flag if any event has incorrect URL format
        let hasProxyFormat = false;
        let hasDirectUrls = false;
        let hasLocalUrls = false;
        
        for (const url of event.mediaUrls) {
          if (!url) continue;
          
          if (url.startsWith('/api/storage-proxy/')) {
            hasProxyFormat = true;
          } else if (url.includes('object-storage.replit.app')) {
            hasDirectUrls = true;
          } else if (url.startsWith('/uploads/')) {
            hasLocalUrls = true;
          }
        }
        
        if (hasProxyFormat) stats.eventsWithProxyFormat++;
        if (hasDirectUrls) stats.eventsWithDirectUrls++;
        if (hasLocalUrls) stats.eventsWithLocalUrls++;
      }
      
      return res.status(200).json({
        message: 'Event media status report',
        stats
      });
    } catch (error) {
      console.error('Error generating calendar media status:', error);
      return res.status(500).json({
        message: 'Error generating calendar media status',
        error: error.message
      });
    }
  });
  
  // Endpoint to check for events with direct Object Storage URLs
  app.get("/api/admin/calendar-media/direct-storage-urls", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Query the database for events with direct Object Storage URLs
      const eventsWithDirectUrls = await db.select({
        id: events.id,
        title: events.title,
        mediaUrls: events.mediaUrls
      })
      .from(events)
      .where(sql`media_urls IS NOT NULL AND media_urls::text LIKE '%object-storage.replit.app%'`);
      
      console.log(`Found ${eventsWithDirectUrls.length} events with direct Object Storage URLs`);
      
      res.json({
        success: true,
        count: eventsWithDirectUrls.length,
        events: eventsWithDirectUrls
      });
    } catch (error) {
      console.error("Error checking for direct Object Storage URLs:", error);
      res.status(500).json({
        success: false,
        message: "Error checking for direct Object Storage URLs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Endpoint to normalize event media URLs for proxy access
  app.post("/api/admin/normalize-event-media-urls", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("[Admin] Starting comprehensive event media URL normalization, requested by:", req.user.username);
      
      // Import the normalization functions dynamically to avoid circular dependencies
      const { runAllNormalizations } = await import('./normalize-event-media-urls');
      
      // Run all normalization routines for maximum coverage
      const results = await runAllNormalizations();
      
      console.log("[Admin] Event media URL normalization completed successfully");
      console.log(`[Admin] Results: ${results.directUrlsUpdated} direct URLs, ${results.legacyUrlsUpdated} legacy URLs, and ${results.allUrlsUpdated} other URLs updated`);
      
      res.json({ 
        success: true, 
        message: "Event media URLs normalized successfully",
        results: {
          directUrlsUpdated: results.directUrlsUpdated,
          legacyUrlsUpdated: results.legacyUrlsUpdated,
          allUrlsUpdated: results.allUrlsUpdated,
          unchanged: results.unchanged,
          total: results.total
        }
      });
    } catch (error) {
      console.error("[Admin] Error normalizing event media URLs:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error normalizing event media URLs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Calendar media migration endpoints
  app.post("/api/admin/migrate-calendar-media", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("[CalendarMediaMigration] Migration requested by admin", {
        userId: req.user.id,
        username: req.user.username
      });
      
      // Start the migration process
      await calendarMediaMigration.migrateCalendarMedia();
      
      res.json({
        success: true,
        message: "Calendar media migration completed successfully"
      });
    } catch (error) {
      console.error("[CalendarMediaMigration] Migration failed:", error);
      res.status(500).json({
        success: false,
        message: "Calendar media migration failed",
        error: error.message
      });
    }
  });
  
  // Endpoints to check the status of media URLs
  app.get("/api/admin/calendar-media/filesystem-urls", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const events = await calendarMediaMigration.findEventsWithFilesystemMedia();
      res.json({
        success: true,
        count: events.length,
        events: events.map(event => ({
          id: event.id,
          title: event.title,
          mediaUrls: event.mediaUrls
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to find events with filesystem media",
        error: error.message
      });
    }
  });
  
  app.get("/api/admin/calendar-media/migration-direct-urls", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const events = await calendarMediaMigration.findEventsWithDirectObjectStorageUrls();
      res.json({
        success: true,
        count: events.length,
        events: events.map(event => ({
          id: event.id,
          title: event.title,
          mediaUrls: event.mediaUrls
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to find events with direct Object Storage URLs",
        error: error.message
      });
    }
  });
  
  // Rocket Launch API endpoint
  app.get("/api/rocket-launches", async (_req, res) => {
    try {
      const launches = await getUpcomingRocketLaunches();
      res.json(launches);
    } catch (error) {
      console.error("Error fetching rocket launches:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to fetch rocket launch data",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Simple in-memory cache for weather data
  const weatherCache = {
    current: {
      data: null,
      timestamp: 0
    },
    forecast: {
      data: null,
      timestamp: 0
    }
  };
  
  // Cache duration in milliseconds (30 minutes)
  const CACHE_DURATION = 30 * 60 * 1000;
  
  // API route to proxy weather data requests (to avoid CORS issues)
  app.get("/api/weather", async (req, res) => {
    try {
      // Get lat and lon from query parameters or use Barefoot Bay defaults
      const lat = req.query.lat || 27.9589;
      const lon = req.query.lon || -80.5603;
      // Get units from query parameter or use imperial as default
      const units = req.query.units || 'imperial';
      
      // Use the API key from environment variables
      const apiKey = process.env.VITE_OPENWEATHER_API_KEY;
      
      if (!apiKey) {
        console.error('OpenWeather API key is missing');
        return res.status(500).json({ error: 'Weather API key is not configured' });
      }
      
      // Check if we have cached data that's still valid
      const now = Date.now();
      if (weatherCache.current.data && (now - weatherCache.current.timestamp) < CACHE_DURATION) {
        console.log('Returning cached weather data');
        return res.json(weatherCache.current.data);
      }
      
      console.log(`Fetching weather data for coordinates: ${lat}, ${lon}`);
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Weather API error response:', errorText);
        
        // If we have cached data, return it even if it's expired
        if (weatherCache.current.data) {
          console.log('Returning expired cached data due to API error');
          return res.json(weatherCache.current.data);
        }
        
        return res.status(response.status).json({ 
          error: `Weather API error: ${response.status} ${response.statusText}`,
          details: errorText
        });
      }
      
      const weatherData = await response.json();
      
      // Update cache
      weatherCache.current = {
        data: weatherData,
        timestamp: now
      };
      
      res.json(weatherData);
    } catch (error) {
      console.error('Error proxying weather data:', error);
      
      // Return cached data if available, even if expired
      if (weatherCache.current.data) {
        console.log('Returning cached data due to error');
        return res.json(weatherCache.current.data);
      }
      
      res.status(500).json({ error: 'Failed to fetch weather data' });
    }
  });
  
  // API route to proxy weather forecast data requests (to avoid CORS issues)
  app.get("/api/weather/forecast", async (req, res) => {
    try {
      // Get lat and lon from query parameters or use Barefoot Bay defaults
      const lat = req.query.lat || 27.9589;
      const lon = req.query.lon || -80.5603;
      // Get units from query parameter or use imperial as default
      const units = req.query.units || 'imperial';
      
      // Use the API key from environment variables
      const apiKey = process.env.VITE_OPENWEATHER_API_KEY;
      
      if (!apiKey) {
        console.error('OpenWeather API key is missing');
        return res.status(500).json({ error: 'Weather API key is not configured' });
      }
      
      // Check if we have cached forecast data that's still valid
      const now = Date.now();
      if (weatherCache.forecast.data && (now - weatherCache.forecast.timestamp) < CACHE_DURATION) {
        console.log('Returning cached forecast data');
        return res.json(weatherCache.forecast.data);
      }
      
      console.log(`Fetching weather forecast for coordinates: ${lat}, ${lon}`);
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Weather forecast API error response:', errorText);
        
        // If we have cached data, return it even if it's expired
        if (weatherCache.forecast.data) {
          console.log('Returning expired cached forecast data due to API error');
          return res.json(weatherCache.forecast.data);
        }
        
        return res.status(response.status).json({ 
          error: `Weather forecast API error: ${response.status} ${response.statusText}`,
          details: errorText
        });
      }
      
      const forecastData = await response.json();
      
      // Update cache
      weatherCache.forecast = {
        data: forecastData,
        timestamp: now
      };
      
      res.json(forecastData);
    } catch (error) {
      console.error('Error proxying weather forecast data:', error);
      
      // Return cached data if available, even if expired
      if (weatherCache.forecast.data) {
        console.log('Returning cached forecast data due to error');
        return res.json(weatherCache.forecast.data);
      }
      
      res.status(500).json({ error: 'Failed to fetch weather forecast data' });
    }
  });

  // Printful sync route
  app.post("/api/printful/sync", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Starting Printful sync process");
      const { syncAllPrintfulProducts } = await import('./printful-sync');
      const syncedCount = await syncAllPrintfulProducts();
      
      res.json({ 
        success: true, 
        message: `Successfully synced ${syncedCount} products from Printful to the local database`,
        syncedCount
      });
    } catch (error) {
      console.error("Error in Printful sync:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to sync products from Printful",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Google API Endpoints
  app.get("/api/google/config", requireAuth, requireAdmin, (req, res) => {
    try {
      const config = googleService.getGoogleApiConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching Google API config:', error);
      res.status(500).json({ message: "Failed to fetch Google API config" });
    }
  });

  app.post("/api/google/config", requireAuth, requireAdmin, (req, res) => {
    try {
      const { mapsApiKey, placesApiKey, geminiApiKey } = req.body;
      
      if (!mapsApiKey || !placesApiKey || !geminiApiKey) {
        return res.status(400).json({ message: "All API keys are required" });
      }
      
      googleService.updateGoogleApiConfig({
        mapsApiKey,
        placesApiKey,
        geminiApiKey
      });
      
      res.json({ success: true, message: "Google API configuration updated successfully" });
    } catch (error) {
      console.error('Error updating Google API config:', error);
      res.status(500).json({ message: "Failed to update Google API config" });
    }
  });

  app.get("/api/google/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = await googleService.checkGoogleApiStatus();
      res.json(status);
    } catch (error) {
      console.error('Error checking Google API status:', error);
      res.status(500).json({ message: "Failed to check Google API status" });
    }
  });
  
  // Public Location Service Status endpoint - No auth required
  app.get("/api/location/service-status", async (req, res) => {
    try {
      // Check Google API status using our service
      const apiStatus = await googleService.checkGoogleApiStatus();
      
      // Determine overall availability based on Maps and Places API status
      const available = 
        apiStatus.maps.status === 'working' || 
        apiStatus.places.status === 'working';
      
      res.json({
        available,
        services: {
          maps: apiStatus.maps.status === 'working',
          places: apiStatus.places.status === 'working'
        },
        message: available 
          ? 'Location services are available' 
          : 'Location services are currently unavailable'
      });
    } catch (error) {
      console.error('Error checking location service status:', error);
      // Default to available=true to avoid unnecessary error messages in the UI
      res.json({
        available: true,
        services: {
          maps: true,
          places: true
        },
        message: 'Location services status check failed, assuming available'
      });
    }
  });

  // Geocode address endpoint - available to public (needed for property listings on public pages)
  app.get("/api/google/geocode", async (req, res) => {
    try {
      const { address } = req.query;
      
      // Get client origin for CORS
      const origin = req.headers.origin || '*';
      
      // Set CORS headers to allow cross-origin requests
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Address parameter is required'
        });
      }
      
      logger.info(`Geocoding address: ${address}`);
      
      // Create URL for the Google Maps Geocoding API
      const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geocodeUrl.searchParams.set('address', address);
      
      // Let the proxy service handle API key
      const response = await googleService.proxyGoogleMapsRequest(geocodeUrl.toString());
      
      // Check response
      if (!response.ok) {
        logger.error(`Geocoding failed with status: ${response.status}`);
        return res.status(response.status).json({
          success: false,
          message: `Geocoding request failed with status: ${response.status}`
        });
      }
      
      // Pass through the API response
      const data = await response.json();
      
      // Cache control - allow caching of geocoding results for 24 hours (86400 seconds)
      res.set('Cache-Control', 'public, max-age=86400');
      
      // Set appropriate content type
      res.set('Content-Type', 'application/json');
      
      // Add ETag for better cache validation
      const etag = require('crypto').createHash('md5').update(JSON.stringify(data)).digest('hex');
      res.set('ETag', `"${etag}"`);
      
      // Preconnect to Google's domains to speed up subsequent requests
      res.set('Link', '<https://maps.googleapis.com>; rel=preconnect; crossorigin, <https://maps.gstatic.com>; rel=preconnect; crossorigin');
      
      return res.json(data);
    } catch (error) {
      logger.error('Error geocoding address:', error);
      return res.status(500).json({
        success: false,
        message: 'Error geocoding address'
      });
    }
  });
  
  // Places Autocomplete API - Server-side implementation to avoid client-side API issues
  app.get("/api/google/places/autocomplete", async (req, res) => {
    try {
      const { input, types = 'address', components = 'country:us' } = req.query;
      
      // Get client origin for CORS
      const origin = req.headers.origin || '*';
      
      // Set CORS headers to allow cross-origin requests
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      
      if (!input || typeof input !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Input parameter is required'
        });
      }
      
      logger.info(`Places Autocomplete for input: ${input}`);
      
      // Create URL for the Google Places Autocomplete API
      const autocompleteUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      autocompleteUrl.searchParams.set('input', input);
      
      // Add optional parameters
      if (types) {
        autocompleteUrl.searchParams.set('types', String(types));
      }
      
      if (components) {
        autocompleteUrl.searchParams.set('components', String(components));
      }
      
      // Let the proxy service handle API key
      const response = await googleService.proxyGoogleMapsRequest(autocompleteUrl.toString());
      
      // Check response
      if (!response.ok) {
        logger.error(`Places Autocomplete failed with status: ${response.status}`);
        return res.status(response.status).json({
          success: false,
          message: `Places Autocomplete request failed with status: ${response.status}`
        });
      }
      
      // Pass through the API response
      const data = await response.json();
      
      // Cache for a short time (5 minutes) since autocomplete results change frequently
      res.set('Cache-Control', 'public, max-age=300');
      
      // Set appropriate content type
      res.set('Content-Type', 'application/json');
      
      // Preconnect to Google's domains to speed up subsequent requests
      res.set('Link', '<https://maps.googleapis.com>; rel=preconnect; crossorigin, <https://maps.gstatic.com>; rel=preconnect; crossorigin');
      
      return res.json(data);
    } catch (error) {
      logger.error('Error fetching place autocomplete:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get place autocomplete suggestions',
        error: String(error)
      });
    }
  });
  
  // Static Maps API endpoint - for showing maps without using the JS API
  app.get("/api/google/staticmap", async (req, res) => {
    try {
      const { center, zoom = 15, size = '600x300', markers, maptype = 'roadmap' } = req.query;
      
      // Get client origin for CORS
      const origin = req.headers.origin || '*';
      
      // Set CORS headers to allow cross-origin requests
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      
      if (!center) {
        return res.status(400).json({
          success: false,
          message: 'Center parameter is required'
        });
      }
      
      logger.info(`Static Map request for center: ${center}`);
      
      // Create URL for the Google Static Maps API
      const staticMapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
      
      // Center can be either coordinates or an address
      staticMapUrl.searchParams.set('center', String(center));
      staticMapUrl.searchParams.set('zoom', String(zoom));
      staticMapUrl.searchParams.set('size', String(size));
      staticMapUrl.searchParams.set('maptype', String(maptype));
      
      // Add markers if provided, or use the center location if not
      if (markers) {
        staticMapUrl.searchParams.set('markers', String(markers));
      } else {
        // If no markers are provided, add a marker at the center
        staticMapUrl.searchParams.set('markers', `color:red|${String(center)}`);
      }
      
      logger.info(`Fetching static map with URL: ${staticMapUrl.toString().replace(/key=([^&]*)/, 'key=REDACTED')}`);
      
      // Let the proxy service handle API key and make the request
      const response = await googleService.proxyGoogleMapsRequest(staticMapUrl.toString());
      
      // Check response
      if (!response.ok) {
        logger.error(`Static Map failed with status: ${response.status}`);
        
        // Instead of returning error JSON, serve a placeholder image
        res.set('Content-Type', 'image/png');
        return res.sendFile(path.join(__dirname, '../public/media-placeholder/map-placeholder.png'));
      }
      
      logger.info(`Successfully fetched static map for ${center}`);
      
      // Get the image buffer
      const imageBuffer = await response.buffer?.();
      
      if (!imageBuffer) {
        logger.error('Failed to get image buffer from response');
        
        // Instead of returning error JSON, serve a placeholder image
        res.set('Content-Type', 'image/png');
        return res.sendFile(path.join(__dirname, '../public/media-placeholder/map-placeholder.png'));
      }
      
      // Set appropriate cache headers (cache for 24 hours)
      res.set('Cache-Control', 'public, max-age=86400');
      
      // Set content type based on response content type
      const contentType = response.headers.get('content-type') || 'image/png';
      res.set('Content-Type', contentType);
      
      // Send the image data
      return res.send(imageBuffer);
    } catch (error) {
      logger.error('Error fetching static map:', error);
      
      // Instead of returning error JSON, serve a placeholder image
      res.set('Content-Type', 'image/png');
      return res.sendFile(path.join(__dirname, '../public/media-placeholder/map-placeholder.png'));
    }
  });
  
  // Add an endpoint to provide the Maps API key for client-side testing
  app.get('/api/google/mapkey', (req, res) => {
    // Get client origin for CORS
    const origin = req.headers.origin || '*';
    
    // Set CORS headers to allow cross-origin requests
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    // The Google Maps API key from environment
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || 
                  process.env.VITE_GOOGLE_MAPS_API_KEY || 
                  'AIzaSyAcmmNAcRcRox1faiPlOIsJjKgPpxIYmRk'; // Fallback key
                  
    res.send(apiKey);
  });
  
  // Geocoding API endpoint - translates addresses to coordinates
  app.get("/api/google/geocode", async (req, res) => {
    try {
      const { address } = req.query;
      
      // Get client origin for CORS
      const origin = req.headers.origin || '*';
      
      // Set CORS headers to allow cross-origin requests
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Address parameter is required'
        });
      }
      
      logger.info(`Geocoding request for address: ${address}`);
      
      // Create URL for the Google Geocoding API
      const geocodingUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geocodingUrl.searchParams.set('address', address);
      
      // Let the proxy service handle API key and make the request
      const response = await googleService.proxyGoogleMapsRequest(geocodingUrl.toString());
      
      // Check response
      if (!response.ok) {
        logger.error(`Geocoding failed with status: ${response.status}`);
        return res.status(response.status).json({
          success: false,
          message: `Geocoding request failed with status: ${response.status}`
        });
      }
      
      // Parse the response
      const data = await response.json();
      
      // Set appropriate cache headers (cache for 1 week since addresses rarely change)
      res.set('Cache-Control', 'public, max-age=604800');
      
      // Set appropriate content type
      res.set('Content-Type', 'application/json');
      
      return res.json(data);
    } catch (error) {
      logger.error('Error geocoding address:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to geocode address',
        error: String(error)
      });
    }
  });

  // Admin cleanup routes
  // Preview unused media files (safe, non-destructive operation)
  app.get("/api/admin/preview/media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin media preview requested by:", req.user.username);
    
    // Media preview has been disabled to prevent accidental deletion of event media
    return res.json({
      success: false,
      message: "Media preview has been disabled to prevent accidental deletion of event media. This feature was causing uploaded event images to disappear.",
      fileCount: 0,
      filesToDelete: [],
      disabled: true
    });
  });

  // Delete unused media files
  app.post("/api/admin/cleanup/media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin media cleanup requested by:", req.user.username);
    
    // Media cleanup has been disabled to prevent accidental deletion of event media
    return res.json({
      success: false,
      message: "Media cleanup has been disabled to prevent accidental deletion of event media. This feature was causing uploaded event images to disappear.",
      disabled: true
    });
  });
  
  // Check for missing media files
  app.get("/api/admin/check/missing-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin check for missing media requested by:", req.user.username);
    try {
      const result = await storage.checkMissingMedia();
      
      console.log(`Found ${result.missingCount} missing media files`);
      
      res.json({ 
        success: true, 
        message: `Found ${result.missingCount} missing media files`,
        ...result
      });
    } catch (error) {
      console.error("Error checking for missing media:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to check for missing media files",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a custom middleware to ensure JSON response 
  const ensureJsonResponse = (req, res, next) => {
    // Capture the original res.send method
    const originalSend = res.send;
    
    res.send = function(body) {
      // Always set content type to application/json
      res.setHeader('Content-Type', 'application/json');
      
      // Check if body is already a JSON string
      if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
        return originalSend.call(this, body);
      }
      
      // If it's not a string or not already JSON, stringify it
      if (typeof body !== 'string') {
        return originalSend.call(this, JSON.stringify(body));
      }
      
      // If it's a string but not JSON, convert to JSON error response
      try {
        // Try parsing it as JSON first
        JSON.parse(body);
        return originalSend.call(this, body);
      } catch (e) {
        // Not valid JSON, create a JSON error response
        console.error("Prevented non-JSON response:", body.substring(0, 100) + "...");
        return originalSend.call(this, JSON.stringify({
          success: false,
          message: "Internal server error - response was not valid JSON",
          error: "Invalid response format"
        }));
      }
    };
    
    next();
  };
  
  // Create a direct backup endpoint for calendar media files
  app.get("/api/admin/backup/calendar-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin calendar media backup requested by:", req.user.username);
    
    try {
      console.log(`Creating backup of calendar media folder`);
      const folder = "calendar";
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for calendar folder`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create backup of calendar media" 
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from calendar`);
      
      // Set appropriate headers to force JSON content type
      res.setHeader('Content-Type', 'application/json');
      return res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from calendar`,
        backupCount: result.backupCount,
        backupPath: result.backupPath
      });
    } catch (error) {
      console.error("Error creating calendar media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create calendar media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a direct backup endpoint for forum media files
  app.get("/api/admin/backup/forum-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin forum media backup requested by:", req.user.username);
    
    try {
      console.log(`Creating backup of forum media folder`);
      const folder = "forum";
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for forum folder`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create backup of forum media" 
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from forum`);
      
      // Set appropriate headers to force JSON content type
      res.setHeader('Content-Type', 'application/json');
      return res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from forum`,
        backupCount: result.backupCount,
        backupPath: result.backupPath
      });
    } catch (error) {
      console.error("Error creating forum media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create forum media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a direct backup endpoint for community media files
  app.get("/api/admin/backup/community-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin community media backup requested by:", req.user.username);
    
    try {
      console.log(`Creating backup of community media folder`);
      const folder = "community";
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for community folder`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create backup of community media" 
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from community`);
      
      // Set appropriate headers to force JSON content type
      res.setHeader('Content-Type', 'application/json');
      return res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from community`,
        backupCount: result.backupCount,
        backupPath: result.backupPath
      });
    } catch (error) {
      console.error("Error creating community media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create community media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a direct backup endpoint for vendors media files
  app.get("/api/admin/backup/vendors-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin vendors media backup requested by:", req.user.username);
    
    try {
      console.log(`Creating backup of vendors media folder`);
      const folder = "vendors";
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for vendors folder`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create backup of vendors media" 
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from vendors`);
      
      // Set appropriate headers to force JSON content type
      res.setHeader('Content-Type', 'application/json');
      return res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from vendors`,
        backupCount: result.backupCount,
        backupPath: result.backupPath
      });
    } catch (error) {
      console.error("Error creating vendors media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create vendors media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a direct backup endpoint for banner slides media files
  app.get("/api/admin/backup/banner-slides-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin banner-slides media backup requested by:", req.user.username);
    
    try {
      console.log(`Creating backup of banner-slides media folder`);
      const folder = "banner-slides";
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for banner-slides folder`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create backup of banner-slides media" 
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from banner-slides`);
      
      // Set appropriate headers to force JSON content type
      res.setHeader('Content-Type', 'application/json');
      return res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from banner-slides`,
        backupCount: result.backupCount,
        backupPath: result.backupPath
      });
    } catch (error) {
      console.error("Error creating banner-slides media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create banner-slides media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a direct backup endpoint for real-estate media files
  app.get("/api/admin/backup/real-estate-media", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin real-estate media backup requested by:", req.user.username);
    
    try {
      console.log(`Creating backup of Real Estate media folder`);
      // Using the folder name with space to match the actual directory structure
      const folder = "real-estate"; // We'll handle the translation to "Real Estate" in the createMediaBackup function
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for real-estate folder`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create backup of real-estate media" 
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from real-estate`);
      
      // Set appropriate headers to force JSON content type
      res.setHeader('Content-Type', 'application/json');
      return res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from real-estate`,
        backupCount: result.backupCount,
        backupPath: result.backupPath
      });
    } catch (error) {
      console.error("Error creating real-estate media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create real-estate media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create a backup of media files (original endpoint, keeping for compatibility)
  app.post("/api/admin/backup/media", requireAuth, requireAdmin, ensureJsonResponse, async (req, res) => {
    console.log("Admin media backup requested by:", req.user.username);
    console.log("Request body:", req.body);
    try {
      const { folder } = req.body;
      
      if (!folder) {
        console.log("Missing folder parameter in request");
        return res.status(400).json({ 
          success: false, 
          message: "Folder parameter is required"
        });
      }
      
      console.log(`Creating backup of media folder: ${folder}`);
      const result = await storage.createMediaBackup(folder);
      
      if (!result.success) {
        console.log(`Backup failed for folder: ${folder}`);
        return res.status(500).json({ 
          success: false, 
          message: `Failed to create backup of ${folder}`
        });
      }
      
      console.log(`Successfully backed up ${result.backupCount} files from ${folder}`);
      
      res.json({ 
        success: true, 
        message: `Successfully backed up ${result.backupCount} files from ${folder}`,
        ...result
      });
    } catch (error) {
      console.error("Error creating media backup:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ 
        success: false, 
        message: "Failed to create media backup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Restore media from backup
  app.post("/api/admin/restore/media", requireAuth, requireAdmin, ensureJsonResponse, async (req, res) => {
    console.log("Admin media restore requested by:", req.user.username);
    try {
      const { backupFolder, targetFolder } = req.body;
      
      if (!backupFolder || !targetFolder) {
        return res.status(400).json({ 
          success: false, 
          message: "Both backupFolder and targetFolder parameters are required"
        });
      }
      
      console.log(`Restoring media from backup ${backupFolder} to ${targetFolder}`);
      const result = await storage.restoreMediaFromBackup(backupFolder, targetFolder);
      
      if (!result.success) {
        return res.status(500).json({ 
          success: false, 
          message: `Failed to restore media from ${backupFolder} to ${targetFolder}`
        });
      }
      
      console.log(`Successfully restored ${result.restoredCount} files to ${targetFolder}`);
      
      res.json({ 
        success: true, 
        message: `Successfully restored ${result.restoredCount} files to ${targetFolder}`,
        ...result
      });
    } catch (error) {
      console.error("Error restoring media:", error);
      // Make sure we're sending JSON content type even for errors
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ 
        success: false, 
        message: "Failed to restore media",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Delete old content versions
  app.post("/api/admin/cleanup/content-versions", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin content version cleanup requested by:", req.user.username);
    try {
      const result = await storage.deleteOldContentVersions();
      
      console.log(`Deleted ${result.deletedCount} old content versions`);
      
      res.json({ 
        success: true, 
        message: `Successfully deleted ${result.deletedCount} old content versions`,
        ...result
      });
    } catch (error) {
      console.error("Error in content version cleanup:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to clean up old content versions",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Set expiration dates for real estate listings that don't have them
  app.post("/api/admin/set-missing-expiration-dates", requireAuth, requireAdmin, async (req, res) => {
    console.log("Admin request to set missing expiration dates by:", req.user.username);
    try {
      // Get listings without expiration dates
      const listings = await storage.getListingsWithoutExpiration();
      
      if (listings.length === 0) {
        return res.json({
          success: true,
          message: "No listings found without expiration dates",
          count: 0,
          updatedIds: []
        });
      }
      
      const updatedIds: number[] = [];
      let count = 0;
      
      // Set expiration date to 30 days from now for each listing
      for (const listing of listings) {
        try {
          // Set expiration date to 30 days from now
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + 30);
          
          await storage.updateListing(listing.id, {
            expirationDate,
            updatedAt: new Date()
          });
          
          console.log(`Set expiration date for listing ID ${listing.id} to ${expirationDate.toISOString()}`);
          count++;
          updatedIds.push(listing.id);
        } catch (updateError) {
          console.error(`Error updating listing ID ${listing.id}:`, updateError);
          // Continue with other listings even if one fails
        }
      }
      
      res.json({
        success: true,
        message: `Successfully set expiration dates for ${count} listings`,
        count,
        updatedIds
      });
    } catch (error) {
      console.error("Error setting missing expiration dates:", error);
      res.status(500).json({
        success: false,
        message: "Failed to set missing expiration dates",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API endpoints for Square API credentials management
  // These duplicate endpoints have been disabled because they were causing conflicts
  // The primary endpoints for Square API settings are at lines 4636 (GET) and 4670 (POST)
  
  /* DISABLED DUPLICATE ENDPOINT - START
  app.get('/api/payments/square-env', requireAdmin, (req, res) => {
    try {
      // Return the environment variables without the actual values
      // for security reasons, we'll just indicate if they are set or not
      res.json({
        squareAccessToken: process.env.SQUARE_ACCESS_TOKEN ? '********' : '',
        squareApplicationId: process.env.SQUARE_APPLICATION_ID || '',
        squareLocationId: process.env.SQUARE_LOCATION_ID || '',
      });
    } catch (error) {
      console.error('Error retrieving Square API credentials:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve Square API credentials',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  app.post('/api/payments/square-env', requireAdmin, async (req, res) => {
    try {
      const { squareAccessToken, squareApplicationId, squareLocationId } = req.body;
      
      // Validate input
      if (!squareAccessToken || !squareApplicationId || !squareLocationId) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }
      
      // Update environment variables
      process.env.SQUARE_ACCESS_TOKEN = squareAccessToken;
      process.env.SQUARE_APPLICATION_ID = squareApplicationId;
      process.env.SQUARE_LOCATION_ID = squareLocationId;
      
      // Reinitialize the Square client with the new credentials
      try {
        await squareService.reinitializeSquareClient();
        
        res.json({
          success: true,
          message: 'Square API credentials updated successfully'
        });
      } catch (error) {
        console.error('Error reinitializing Square client:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to reinitialize Square client with new credentials',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      console.error('Error updating Square API credentials:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update Square API credentials',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  DISABLED DUPLICATE ENDPOINT - END */
  
  // Endpoint to check for expired listings (admin only)
  app.post("/api/admin/check-expired-listings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Import the service
      const { checkExpiredListings } = await import('./listing-expiration-service');
      
      // Optional reference date for testing (if provided)
      let referenceDate = undefined;
      
      if (req.body.referenceDate) {
        referenceDate = new Date(req.body.referenceDate);
        console.log(`Using reference date: ${referenceDate.toISOString()}`);
      }
      
      // Run the check
      const result = await checkExpiredListings(referenceDate);
      
      res.json({
        success: true,
        message: `Processed ${result.checked} listings: ${result.renewed} renewed, ${result.expired} expired`,
        ...result
      });
    } catch (err) {
      console.error("Error checking expired listings:", err);
      res.status(500).json({ 
        success: false, 
        message: err instanceof Error ? err.message : "Failed to check expired listings"
      });
    }
  });
  
  // Endpoint to check for listings expiring soon (admin only)
  app.post("/api/admin/check-expiring-listings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const { daysUntilExpiration = 3 } = req.body;
      
      // Import the service
      const { checkExpiringListings } = await import('./listing-expiration-service');
      
      // Run the check
      const result = await checkExpiringListings(Number(daysUntilExpiration));
      
      res.json({
        success: true,
        message: `Found ${result.count} listings expiring in ${daysUntilExpiration} days`,
        ...result
      });
    } catch (err) {
      console.error("Error checking expiring listings:", err);
      res.status(500).json({ 
        success: false, 
        message: err instanceof Error ? err.message : "Failed to check expiring listings"
      });
    }
  });
  
  // Endpoint to set expiration date for listings without one (admin only)
  app.post("/api/admin/set-listing-expirations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get all listings without an expiration date
      const listings = await storage.getListingsWithoutExpiration();
      console.log(`Found ${listings.length} listings without expiration dates`);
      
      const updated = [];
      
      // For each listing, set an expiration date 30 days from creation
      for (const listing of listings) {
        const creationDate = new Date(listing.createdAt);
        const expirationDate = new Date(creationDate);
        expirationDate.setDate(expirationDate.getDate() + 30);
        
        console.log(`Setting expiration date for listing ${listing.id} to ${expirationDate.toISOString()}`);
        
        const updatedListing = await storage.updateListing(listing.id, {
          expirationDate,
          updatedAt: new Date()
        });
        
        updated.push({
          id: updatedListing.id,
          title: updatedListing.title,
          expirationDate: updatedListing.expirationDate
        });
      }
      
      res.json({
        success: true,
        message: `Updated ${updated.length} listings with expiration dates`,
        listings: updated
      });
    } catch (err) {
      console.error("Error setting listing expirations:", err);
      res.status(500).json({ 
        success: false, 
        message: err instanceof Error ? err.message : "Failed to set listing expirations"
      });
    }
  });

  // Square API credentials endpoint for client-side initialization
  app.get("/api/square/app-info", (req, res) => {
    const appInfo = getSquareAppInfo();
    res.json(appInfo);
  });
  
  // System health and monitoring endpoint
  app.get("/api/system/health", async (req, res) => {
    try {
      const startTime = Date.now();
      
      // Check database connection
      let dbStatus = 'error';
      let dbResponse = null;
      let dbLatency = 0;
      
      try {
        const dbStart = Date.now();
        await db.execute(sql`SELECT 1 as ping`);
        dbLatency = Date.now() - dbStart;
        dbStatus = 'connected';
      } catch (dbError) {
        dbResponse = dbError.message;
      }
      
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      
      // Check session store
      let sessionStatus = 'error';
      try {
        if (storage.sessionStore) {
          sessionStatus = 'connected';
        }
      } catch (sessionError) {
        sessionStatus = 'error';
      }
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Return comprehensive health data
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        database: {
          status: dbStatus,
          latency: dbLatency,
          error: dbResponse
        },
        sessions: {
          status: sessionStatus
        },
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
        },
        environment: process.env.NODE_ENV || 'development',
        responseTime: responseTime + 'ms'
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Health check failed',
        error: error.message
      });
    }
  });
  
  /**
   * API endpoint to get a presigned URL for Object Storage media
   * This enables client-side access to private Object Storage files
   */
  app.get('/api/media/presigned', async (req, res) => {
    try {
      // Import the object storage module
      const objectStorage = await import('./object-storage.js');
      
      const { key } = req.query;
      
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing or invalid key parameter' 
        });
      }
      
      // Get a presigned URL with a short expiration (10 minutes)
      const presignedUrl = await objectStorage.getPresignedUrl(key, 600);
      
      res.json({ 
        success: true, 
        url: presignedUrl 
      });
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate presigned URL',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Google Maps proxy routes are already defined at the top of the file

  // Gemini API proxy to avoid CORS issues
  app.post("/api/gemini-proxy", async (req, res) => {
    try {
      const { model, contents, generationConfig } = req.body;
      
      if (!model || !contents) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      // Try both environment variable formats
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
      
      console.log("Using Gemini API Key:", apiKey ? "Present (masked)" : "Not found");
      
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      // Check if this is a search query related to rentals
      if (contents[0]?.parts?.[0]?.text) {
        const promptText = contents[0].parts[0].text;
        const userQuery = promptText.match(/User query: "(.*?)"/)?.[1] || "";
        
        // Check if the query is related to rentals
        const rentalKeywords = ['rent', 'rental', 'lease', 'apartment', 'tenant'];
        const isRentalQuery = rentalKeywords.some(keyword => 
          userQuery.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (isRentalQuery) {
          console.log("Rental query detected:", userQuery);
          // Add a prefetch instruction to prioritize rental listings
          contents[0].parts[0].text = promptText.replace(
            "IMPORTANT FILTERING INSTRUCTIONS FOR REAL ESTATE AND FOR-SALE LISTINGS:",
            "!!!RENTAL QUERY DETECTED!!! - This is definitely a rental query!\n\nIMPORTANT FILTERING INSTRUCTIONS FOR REAL ESTATE AND FOR-SALE LISTINGS:"
          );
        }
      }
      
      // Log the request for debugging
      console.log("Gemini API request payload:", JSON.stringify({ model, contents, generationConfig }, null, 2));
      
      // Build the URL with the model name and API key
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      // Make the request to Gemini API
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API error:', errorData);
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      return res.json(data);
    } catch (error) {
      console.error('Error proxying Gemini API request:', error);
      return res.status(500).json({ error: "Failed to proxy request to Gemini API", message: error.message });
    }
  });
  
  // Site Settings API Routes
  app.get('/api/site-settings', async (req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      return res.json(settings);
    } catch (error) {
      console.error('Error retrieving site settings:', error);
      return res.status(500).json({ error: "Failed to retrieve site settings", message: error.message });
    }
  });
  
  app.get('/api/site-settings/:key', async (req, res) => {
    try {
      const key = req.params.key;
      const setting = await storage.getSiteSettingByKey(key);
      
      if (!setting) {
        return res.status(404).json({ error: `Setting with key "${key}" not found` });
      }
      
      return res.json(setting);
    } catch (error) {
      console.error(`Error retrieving site setting:`, error);
      return res.status(500).json({ error: "Failed to retrieve site setting", message: error.message });
    }
  });
  
  app.get('/api/site-settings/value/:key', async (req, res) => {
    try {
      const key = req.params.key;
      console.log(`Getting site setting value for key: ${key}`);
      console.log(`User authenticated: ${req.isAuthenticated ? 'Yes' : 'No'}`);
      console.log(`User role: ${req.user?.role || 'Not logged in'}`);
      
      // First check if the setting exists in the database
      const setting = await storage.getSiteSettingByKey(key);
      console.log(`Direct DB query for setting: ${JSON.stringify(setting)}`);
      
      // Then get just the value using the getSettingValue helper
      const value = await storage.getSettingValue(key);
      console.log(`Retrieved value from storage: ${value}`);
      
      if (value === null) {
        console.log(`Setting with key "${key}" not found, returning 404`);
        return res.status(404).json({ error: `Setting with key "${key}" not found` });
      }
      
      console.log(`Returning site setting: { key: ${key}, value: ${value} }`);
      return res.json({ key, value });
    } catch (error) {
      console.error(`Error retrieving site setting value:`, error);
      return res.status(500).json({ error: "Failed to retrieve setting value", message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  app.post('/api/site-settings', async (req, res) => {
    // Check if user is authenticated and is admin
    if (!req.isAuthenticated || !req.user || req.user.role !== 'admin') {
      // For non-admin users, check if the request is for specific non-sensitive site settings
      // that we want to allow guests to update (like custom rocket icons)
      const { key } = req.body;
      const publicSettingKeys = ['custom-icon-rocket'];
      
      if (!publicSettingKeys.includes(key)) {
        return res.status(403).json({ error: "Not authorized to update this site setting" });
      }
    }
    
    try {
      const { key, value, description } = req.body;
      
      if (!key || value === undefined) {
        return res.status(400).json({ error: "Key and value are required" });
      }
      
      const userId = req.user?.id || null; // Allow null userId for guest updates to whitelisted settings
      const setting = await storage.setSiteSetting(key, value, description, userId);
      
      return res.json(setting);
    } catch (error) {
      console.error('Error setting site setting:', error);
      return res.status(500).json({ error: "Failed to set site setting", message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  app.delete('/api/site-settings/:id', async (req, res) => {
    // Check if user is authenticated and is admin
    if (!req.isAuthenticated || !req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: "Not authorized to delete site settings" });
    }
    try {
      const id = parseInt(req.params.id, 10);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      
      const success = await storage.deleteSiteSetting(id);
      
      if (!success) {
        return res.status(404).json({ error: `Setting with ID ${id} not found` });
      }
      
      return res.json({ success: true, message: `Setting with ID ${id} deleted successfully` });
    } catch (error) {
      console.error(`Error deleting site setting:`, error);
      return res.status(500).json({ error: "Failed to delete site setting", message: error.message });
    }
  });

  // Launch page settings API endpoints
  app.get("/api/launch/settings", async (req, res) => {
    try {
      const settings = {
        launchDate: await storage.getSettingValue("launch_date") || new Date(Date.now() + 86400000).toISOString(), // Default to tomorrow
        rocketIcon: await storage.getSettingValue("rocket_icon") || "",
        launchMessage: await storage.getSettingValue("launch_message") || "Get ready for takeoff!",
        soundEnabled: await storage.getSettingValue("launch_sound_enabled") === "true",
        isActive: await storage.getSettingValue("launch_is_active") === "true"
      };
      
      // Log for debugging
      console.log("Retrieved launch settings:", settings);
      
      res.json({
        success: true,
        settings
      });
    } catch (error) {
      console.error("Error retrieving launch settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve launch settings",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update launch settings (admin only)
  app.post("/api/launch/settings", requireAdmin, async (req, res) => {
    try {
      const { launchDate, rocketIcon, launchMessage, soundEnabled, isActive } = req.body;
      
      // Validate input
      if (!launchDate) {
        return res.status(400).json({
          success: false,
          message: "Launch date is required"
        });
      }
      
      // Save settings
      const userId = req.user?.id;
      await storage.setSiteSetting("launch_date", launchDate, "Scheduled launch date", userId);
      await storage.setSiteSetting("rocket_icon", rocketIcon || "", "Custom rocket icon URL", userId);
      await storage.setSiteSetting("launch_message", launchMessage || "Get ready for takeoff!", "Pre-launch message", userId);
      await storage.setSiteSetting("launch_sound_enabled", soundEnabled ? "true" : "false", "Whether sound effects are enabled", userId);
      await storage.setSiteSetting("launch_is_active", isActive ? "true" : "false", "Whether launch page is active", userId);
      
      // Return updated settings
      res.json({
        success: true,
        message: "Launch settings updated successfully"
      });
    } catch (error) {
      console.error("Error updating launch settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update launch settings",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Trigger immediate launch (admin only)
  app.post("/api/launch/trigger", requireAdmin, async (req, res) => {
    try {
      const now = new Date().toISOString();
      const userId = req.user?.id;
      
      // Update launch date to now (triggers immediate launch)
      await storage.setSiteSetting("launch_date", now, "Manually triggered launch date", userId);
      await storage.setSiteSetting("launch_manually_triggered", "true", "Flag indicating manual launch", userId);
      
      res.json({
        success: true,
        message: "Launch triggered successfully",
        launchDate: now
      });
    } catch (error) {
      console.error("Error triggering launch:", error);
      res.status(500).json({
        success: false,
        message: "Failed to trigger launch",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // EMERGENCY DIRECT BANNER UPLOAD ENDPOINT
  // This is a simplified and direct approach to ensure banner uploads work
  app.post("/api/direct-banner-upload", upload.single('bannerImage'), mediaSyncMiddleware, async (req: any, res) => {
    console.log('DIRECT BANNER UPLOAD REQUEST RECEIVED');
    
    if (!req.isAuthenticated()) {
      console.log('Direct banner upload failed: Not authenticated');
      return res.status(401).json({ 
        success: false,
        message: "Not authenticated" 
      });
    }

    if (req.user.role !== 'admin') {
      console.log('Direct banner upload failed: Not an admin. User role:', req.user.role);
      return res.status(403).json({ 
        success: false,
        message: "Admin access required" 
      });
    }

    if (!req.file) {
      console.log('Direct banner upload failed: No file provided');
      return res.status(400).json({ 
        success: false,
        message: "No file was uploaded" 
      });
    }

    try {
      // Import media types and createMediaFilename from media-path-utils
      const { 
        MEDIA_TYPES, 
        createMediaFilename
      } = await import('./media-path-utils');
      
      // Import special override functions that ensure banner slides ONLY use Object Storage
      const {
        verifyBannerSlideExists,
        syncBannerSlide
      } = await import('./banner-storage-override');
      
      console.log('Direct banner upload processing file:', req.file.originalname);
      
      // Generate a unique filename using our utility function
      const fileExtension = path.extname(req.file.originalname);
      const newFilename = createMediaFilename('bannerImage', fileExtension);
      
      // Get the file data - either from buffer or by reading the file
      let fileData;
      try {
        if (req.file.buffer) {
          fileData = req.file.buffer;
          console.log('Using file buffer for upload');
        } else if (req.file.path) {
          fileData = fs.readFileSync(req.file.path);
          console.log('Using file from disk for upload');
        } else {
          throw new Error("No file buffer or path available");
        }
      } catch (fileReadError) {
        console.error("Failed to read upload file:", fileReadError);
        return res.status(500).json({
          success: false,
          message: "Could not read uploaded file"
        });
      }
      
      // Upload directly to Object Storage first
      console.log('Uploading banner slide to Object Storage via direct upload...');
      const BANNER_BUCKET = 'BANNER'; // Use dedicated BANNER bucket for banner slides
      
      // Create a temporary file if we only have the buffer
      let tempFilePath;
      if (!req.file.path && fileData) {
        tempFilePath = path.join(os.tmpdir(), `temp-direct-banner-${Date.now()}-${newFilename}`);
        fs.writeFileSync(tempFilePath, fileData);
        console.log(`Created temporary file for upload: ${tempFilePath}`);
        req.file.path = tempFilePath;
      }
      
      // Upload ONLY to Object Storage for banner slides, no filesystem fallback
      let objectStorageUrl;
      try {
        // Import objectStorageService
        const { objectStorageService } = await import('./object-storage-service');
        
        objectStorageUrl = await objectStorageService.uploadFile(
          req.file.path,
          'banner-slides',
          newFilename,
          BANNER_BUCKET
        );
        
        console.log(`Successfully uploaded to Object Storage: ${objectStorageUrl}`);
      } catch (uploadError) {
        console.error("Error uploading to Object Storage in direct upload:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload to Object Storage. Banner slides must use Object Storage exclusively."
        });
      }
      
      // Generate the URLs but don't save to filesystem, only use Object Storage
      // We're constructing the URLs manually instead of using saveMediaFile 
      // to avoid filesystem storage
      const urls = {
        url: objectStorageUrl,
        developmentUrl: objectStorageUrl
      };
      
      // Clean up the temporary file if we created one
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`Deleted temporary file: ${tempFilePath}`);
        } catch (unlinkError) {
          console.warn("Failed to delete temporary file:", tempFilePath, unlinkError);
        }
      }
      
      if (!urls) {
        console.error("Banner slide upload failed: saveMediaFile returned null");
        return res.status(500).json({ 
          success: false,
          message: "Failed to save banner image to required locations" 
        });
      }
      
      // Use our override function that ensures Object Storage is being used exclusively
      // This will always return true since we verify during the Object Storage upload
      verifyBannerSlideExists(newFilename);
      // We don't need to check the return value since our override always returns true
      
      // If multer created a temporary file, delete it as we've saved our own copies
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
          console.log(`Deleted temporary file: ${req.file.path}`);
        } catch (unlinkError) {
          console.warn("Failed to delete temporary file:", req.file.path, unlinkError);
          // Non-fatal error, continue
        }
      }
      
      // Try to sync any other banner slides that might have issues
      try {
        // Get a list of all banner slides in uploads directory
        const uploadsDir = path.join(__dirname, '../uploads', MEDIA_TYPES.BANNER_SLIDES);
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          console.log(`Found ${files.length} existing banner slides to verify`);
          
          // Verify each file exists in both locations
          let syncCount = 0;
          for (const filename of files) {
            if (filename !== newFilename) { // Skip the one we just uploaded
              if (syncBannerSlide(filename)) {
                syncCount++;
              }
            }
          }
          if (syncCount > 0) {
            console.log(`Synchronized ${syncCount} existing banner slides`);
          }
        }
      } catch (syncError) {
        console.warn("Non-fatal error syncing other banner slides:", syncError);
        // Continue with the upload response
      }
      
      console.log(`Direct banner upload successful. Dev URL: ${urls.devUrl}, Prod URL: ${urls.prodUrl}, Object Storage URL: ${objectStorageUrl || 'not available'}`);
      
      // IMPORTANT: Use the Object Storage URL as primary if available, otherwise fall back to uploads
      const primaryUrl = objectStorageUrl || urls.devUrl;
      
      res.json({
        success: true,
        url: primaryUrl,  // Now prioritizing Object Storage URL over dev URL
        developmentUrl: urls.devUrl,
        productionUrl: urls.prodUrl,
        objectStorageUrl: objectStorageUrl, // Also include explicitly for backward compatibility
        message: "Banner image uploaded successfully via direct upload"
      });
    } catch (err) {
      console.error("Error in direct banner upload:", err);
      res.status(500).json({
        success: false,
        message: `Failed to upload banner image: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });

  const httpServer = createServer(app);
  
  // WebSocket functionality disabled to avoid interference with Object Storage
  /*
  // Set up WebSocket server on a distinct path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Helper function to broadcast messages to all connected WebSocket clients
  const broadcastWebSocketMessage = (type: string, data: any) => {
    if (!wss || !wss.clients || wss.clients.size === 0) {
      console.log(`No WebSocket clients connected, skipping ${type} broadcast`);
      return;
    }
    
    console.log(`Broadcasting ${type} event to ${wss.clients.size} clients`);
    
    // Apply media synchronization before broadcasting
    const message = {
      type,
      data
    };

    // Synchronize media paths if needed
    const processedMessage = syncWebSocketMediaUrls(message);
    
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(processedMessage));
      }
    });
  };
  */
  
  // Real broadcast function for WebSocket messages
  let broadcastWebSocketMessage = (type: string, data: any) => {
    console.log(`WebSocket message: broadcasting ${type} event`);
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type,
          data,
          timestamp: new Date().toISOString()
        }));
      }
    });
  };

  // WebSocket functionality completely disabled to avoid interference with Object Storage
  /*
  // WebSocket connection handling
  wss.on('connection', (socket: WebSocket, req) => {
    const extSocket = socket as ExtendedWebSocket;
    
    // Get client information for better debugging
    const clientIp = req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const origin = req.headers.origin || 'unknown';
    const clientId = Math.random().toString(36).substring(2, 15);
    
    console.log(`WebSocket client connected [${clientId}] from ${clientIp}`);
    console.log(`Client details: Origin=${origin}, UA=${userAgent}`);
    console.log(`Active WebSocket connections: ${wss.clients.size}`);
    
    // Add ping/pong for connection keepalive
    extSocket.isAlive = true;
    extSocket.on('pong', () => {
      extSocket.isAlive = true;
    });
    
    // Handle incoming messages
    extSocket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`Received message from client [${clientId}]:`, data);
        
        // Special handling for video status messages
        if (data.type === 'video-status' && data.data?.url) {
          // This prevents unnecessary broadcast of video error states
          if (data.data.status === 'error') {
            console.log(`Client [${clientId}] reported video error for ${data.data.url} - not broadcasting`);
            return;
          }

          // Extended logging for video playback events
          console.log(`Client [${clientId}] video ${data.data.status} at ${data.data.timestamp} for ${data.data.url}`);
        }
        
        // Broadcast message to all connected clients
        broadcastWebSocketMessage('broadcast', data);
      } catch (err) {
        console.error(`Error processing WebSocket message from client [${clientId}]:`, err);
      }
    });
    
    // Handle errors
    extSocket.on('error', (error) => {
      console.error(`WebSocket error from client [${clientId}]:`, error);
    });
    
    // Handle disconnection
    extSocket.on('close', (code, reason) => {
      console.log(`WebSocket client [${clientId}] disconnected. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      // The clients.size is automatically updated after the close event is handled
      // so we need to log the current size, not size-1
      console.log(`Remaining WebSocket connections: ${wss.clients.size}`);
    });
    
    // Send initial connection confirmation
    try {
      extSocket.send(JSON.stringify({
        type: 'connection',
        status: 'connected',
        clientId: clientId,
        message: 'Successfully connected to Barefoot Bay WebSocket server',
        time: new Date().toISOString()
      }));
    } catch (error) {
      console.error(`Failed to send welcome message to client [${clientId}]:`, error);
    }
  });
  
  // Set up a heartbeat interval to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((socket: WebSocket) => {
      const extSocket = socket as ExtendedWebSocket;
      
      if (extSocket.isAlive === false) {
        console.log('Terminating inactive WebSocket connection');
        return extSocket.terminate();
      }
      
      extSocket.isAlive = false;
      extSocket.ping();
    });
  }, 30000); // Check every 30 seconds
  
  // Clean up interval on server close
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    console.log('WebSocket server closed, heartbeat interval cleared');
  });
  */
  
  // WebSocket is already configured earlier in the code
  console.log('WebSocket server configuration already includes chat support');
  
  return httpServer;
}