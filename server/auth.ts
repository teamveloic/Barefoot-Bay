import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { pool } from "./db";
import { applyPerformanceOptimizations } from "./performance";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function generateResetToken(): string {
  // Generate a random token for password reset
  return randomBytes(32).toString("hex");
}

// Middleware to check if user is authenticated
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Skip authentication checks for uploads and static files
  // This is critical to ensure media remains accessible regardless of session state
  if ((req as any).skipAuth === true || req.path.startsWith('/uploads/')) {
    return next();
  }
  
  // Set CORS headers for production environments before any auth checks
  if (process.env.NODE_ENV === 'production') {
    // Allow credentials for cross-origin requests
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Set origin based on the request's origin header
    if (req.headers.origin) {
      res.header('Access-Control-Allow-Origin', req.headers.origin);
    }
    
    // Handle preflight requests (OPTIONS)
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      return res.status(204).end(); // Respond to preflight with 204 No Content
    }
  }

  // Enhanced debug information for troubleshooting authentication issues
  console.log("Authentication check details:", {
    isAuthenticated: req.isAuthenticated(),
    hasUser: !!req.user,
    userID: req.user?.id,
    sessionID: req.sessionID,
    path: req.path,
    method: req.method,
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer,
      cookie: req.headers.cookie ? "Present" : "None"
    },
    cookies: req.cookies,
    isSecure: req.secure,
    sessionUserId: req.session?.passport?.user
  });

  // Check for standard session-based authentication
  if (req.isAuthenticated()) {
    return next();
  }
  
  // If we reach here, the user is not authenticated through the session
  // Check for alternative authentication methods like authToken for cross-domain API calls
  
  // Check for token in query parameter for cross-domain API requests
  const authToken = req.query.authToken as string;
  if (authToken && process.env.NODE_ENV === 'production') {
    // Token should be in format userId.timestamp.CHECKSUM
    const tokenParts = authToken.split('.');
    if (tokenParts.length === 3) {
      const userId = parseInt(tokenParts[0], 10);
      const timestamp = parseInt(tokenParts[1], 10);
      
      // Check if token is expired (15 minutes)
      const isExpired = Date.now() - timestamp > 15 * 60 * 1000;
      
      if (!isNaN(userId) && !isExpired) {
        // Validate the token here - in a real system you'd verify a digital signature
        // For now, we're just checking for valid format and expiration
        console.log("Valid auth token used for:", req.path, "User ID:", userId);
        
        // For forum post edits, allow the operation with the token
        if (req.path.includes('/forum/posts/') && req.method === 'PATCH') {
          // Set req.user for downstream middleware
          (req as any).user = { id: userId, role: 'registered' };
          return next();
        }
      }
    }
  }

  // If all authentication methods fail, return 401
  return res.status(401).json({ 
    error: "Not authenticated",
    message: "You must be logged in to access this resource",
    sessionInfo: {
      hasSession: !!req.session,
      sessionID: req.sessionID ? "Present" : "Missing"
    }
  });
}

// Middleware to check if user is an admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Skip authentication checks for uploads and static files
  // This is critical to ensure media remains accessible regardless of session state
  if ((req as any).skipAuth === true || req.path.startsWith('/uploads/')) {
    return next();
  }
  
  // Enhanced debug information for troubleshooting admin authentication issues
  console.log("Admin authentication check:", {
    isAuthenticated: req.isAuthenticated(),
    hasUser: !!req.user,
    userID: req.user?.id,
    userRole: req.user?.role,
    sessionID: req.sessionID,
    path: req.path,
    method: req.method,
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer,
      cookie: req.headers.cookie ? "Present" : "None"
    }
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

  if (!req.isAuthenticated()) {
    return res.status(401).json({ 
      error: "Not authenticated",
      message: "You must be logged in to access this resource",
      sessionInfo: {
        hasSession: !!req.session,
        sessionID: req.sessionID ? "Present" : "Missing"
      }
    });
  }
  
  if (req.user.role !== 'admin') {
    console.error(`Admin authentication failed for user: ${req.user.username} (role: ${req.user.role})`);
    return res.status(403).json({ 
      error: "Admin access required",
      message: "You must have administrator privileges to access this feature"
    });
  }
  
  // User is authenticated and has admin role
  console.log(`Admin authentication successful for user: ${req.user.username} (ID: ${req.user.id})`);
  next();
}

// Alias for validateAdmin to maintain backward compatibility
export const validateAdmin = requireAdmin;

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  app.use(passport.initialize());
  app.use(passport.session());
  
  // Add a special authentication status endpoint that can be used to check login state
  // This is especially useful for the messages page and cross-domain verification
  app.get('/api/auth/status', (req, res) => {
    console.log('Auth status check requested:', {
      isAuthenticated: req.isAuthenticated(),
      userId: req.user?.id,
      path: req.path,
      origin: req.headers.origin,
      referer: req.headers.referer
    });
    
    // Always include CORS headers to ensure this works across subdomains
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    res.json({
      authenticated: req.isAuthenticated(),
      user: req.user ? {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        isAdmin: req.user.role === 'admin'
      } : null
    });
  });
  
  // Now that authentication is set up, apply performance optimizations
  // This ensures rate limiting can properly check for authenticated users
  applyPerformanceOptimizations(app, pool);

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Use case-insensitive username comparison for login
        const user = await storage.getUserByUsernameCaseInsensitive(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (err) {
        console.error("Authentication error:", err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user: Express.User, done) => {
    console.log("Serializing user:", { id: user?.id, type: typeof user?.id });

    if (!user || user.id === undefined || user.id === null) {
      console.error("Invalid user object during serialization:", user);
      return done(new Error("Invalid user data"));
    }

    // Always store as number
    const numericId = Number(user.id);
    if (isNaN(numericId)) {
      console.error("Failed to convert user ID to number:", user.id);
      return done(new Error("Invalid user ID format"));
    }

    console.log("Serialized user ID:", numericId);
    done(null, numericId);
  });

  passport.deserializeUser(async (id: unknown, done) => {
    console.log("Deserializing user ID:", id, "Type:", typeof id);

    try {
      // Convert to number if string, maintain if already number
      const numericId = typeof id === 'string' ? parseInt(id, 10) : Number(id);

      if (isNaN(numericId)) {
        console.error("Invalid user ID format during deserialization:", id);
        return done(new Error("Invalid user ID format"));
      }

      console.log("Attempting to fetch user with ID:", numericId);
      const user = await storage.getUser(numericId);

      if (!user) {
        console.log("No user found for ID:", numericId);
        return done(null, false);
      }

      console.log("User found:", { id: user.id, username: user.username });
      done(null, user);
    } catch (err) {
      console.error("Deserialization error:", err);
      done(err);
    }
  });

  app.post("/api/register", async (req, res) => {
    try {
      if (!req.body.username || !req.body.password || !req.body.email || !req.body.fullName) {
        return res.status(400).json({ 
          message: "Username, password, email, and full name are required" 
        });
      }

      // Check for existing username with case-insensitive comparison
      const existingUser = await storage.getUserByUsernameCaseInsensitive(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      
      // Check if user meets Badge Holder criteria (previously called "Resident")
      const isLocalResident = req.body.isLocalResident || false;
      const ownsHomeInBB = req.body.ownsHomeInBB || false;
      const isFullTimeResident = req.body.isFullTimeResident || false;
      const isSnowbird = req.body.isSnowbird || false;
      const hasMembershipBadge = req.body.hasMembershipBadge || false;
      
      // If any of these criteria are true, set role to badge_holder
      const isBadgeHolder = isLocalResident || ownsHomeInBB || isFullTimeResident || 
                            isSnowbird || hasMembershipBadge;
      
      const userRole = isBadgeHolder ? 'badge_holder' : 'registered';
      
      console.log(`User ${req.body.username} registration: Badge Holder status: ${isBadgeHolder}, assigning role: ${userRole}`);
      
      const user = await storage.createUser({
        username: req.body.username,
        password: hashedPassword,
        email: req.body.email,
        fullName: req.body.fullName,
        isResident: req.body.isResident || false, // Legacy field kept for backward compatibility, use Badge Holder role instead
        avatarUrl: req.body.avatarUrl,
        role: userRole, // Set role based on Badge Holder status
        isApproved: false, // Still require approval for moderation
        
        // Resident section survey fields
        isLocalResident: isLocalResident,
        ownsHomeInBB: ownsHomeInBB,
        rentsHomeInBB: req.body.rentsHomeInBB || false,
        isFullTimeResident: isFullTimeResident,
        isSnowbird: isSnowbird,
        hasMembershipBadge: hasMembershipBadge,
        membershipBadgeNumber: req.body.membershipBadgeNumber || null,
        buysDayPasses: req.body.buysDayPasses || false,
        
        // Non-resident section survey fields
        hasLivedInBB: req.body.hasLivedInBB || false,
        hasVisitedBB: req.body.hasVisitedBB || false,
        neverVisitedBB: req.body.neverVisitedBB || false,
        hasFriendsInBB: req.body.hasFriendsInBB || false,
        consideringMovingToBB: req.body.consideringMovingToBB || false,
        wantToDiscoverBB: req.body.wantToDiscoverBB || false,
        neverHeardOfBB: req.body.neverHeardOfBB || false,
      });

      req.login(user, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return res.status(500).json({ message: "Registration successful but login failed" });
        }
        res.status(201).json(user);
      });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ 
        message: "Registration failed. Please try again later.",
        details: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: any) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error("Session creation error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Log session info for debugging
        console.log("Login successful, session info:", {
          id: req.sessionID,
          cookie: req.session?.cookie,
          user: user.id
        });
        
        res.json(user);
      });
    })(req, res, next);
  });
  
  // Add a compatibility endpoint for cross-domain login
  app.post("/api/auth/login", (req, res, next) => {
    console.log("Cross-domain login attempt", {
      username: req.body.username,
      origin: req.headers.origin,
      host: req.headers.host
    });
    
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: any) => {
      if (err) {
        console.error("Cross-domain login error:", err);
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error("Cross-domain session creation error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Log session info for debugging
        console.log("Cross-domain login successful, session info:", {
          id: req.sessionID,
          cookie: req.session?.cookie,
          user: user.id
        });
        
        res.json({
          user,
          isAuthenticated: true
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destruction error:", err);
          return res.status(500).json({ message: "Logout failed" });
        }
        req.logout(() => {
          res.sendStatus(200);
        });
      });
    } else {
      res.sendStatus(200);
    }
  });
  
  // Add a cross-domain logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    console.log("Cross-domain logout requested", {
      isAuthenticated: req.isAuthenticated(),
      sessionID: req.sessionID,
      origin: req.headers.origin,
      host: req.headers.host
    });
    
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Cross-domain session destruction error:", err);
          return res.status(500).json({ message: "Logout failed", success: false });
        }
        req.logout(() => {
          res.json({ message: "Logged out successfully", success: true });
        });
      });
    } else {
      res.json({ message: "Already logged out", success: true });
    }
  });

  app.get("/api/user", (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });

  // Enhanced auth check endpoint for cross-domain compatibility
  app.get("/api/auth/check", (req, res) => {
    console.log("Auth check requested", {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? { id: req.user.id, username: req.user.username } : null,
      sessionID: req.sessionID,
      cookies: req.headers.cookie,
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer
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
    
    if (req.isAuthenticated() && req.user) {
      // If authenticated, generate a token that can be used for cross-domain auth
      const timestamp = Date.now();
      const userId = req.user.id;
      
      // Only generate tokens for admin users as a security measure
      const isAdmin = req.user.role === 'admin';
      const authToken = isAdmin ? `${userId}.${timestamp}.CHECKSUM` : null;
      
      return res.json({
        isAuthenticated: true,
        user: req.user,
        // Only include token for admin users in production environment
        ...(isAdmin && process.env.NODE_ENV === 'production' && { 
          authToken,
          tokenExpires: new Date(timestamp + 15 * 60 * 1000) // 15 minutes from now
        })
      });
    } else {
      return res.json({
        isAuthenticated: false,
        user: null
      });
    }
  });
  
  // Add a specialized endpoint for cross-domain authentication in production
  app.get("/api/auth/token", (req, res) => {
    console.log("Auth token requested", {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null,
      sessionID: req.sessionID,
      path: req.path,
      referrer: req.headers.referer
    });
    
    // For production environments, add CORS headers for cross-domain support
    if (process.env.NODE_ENV === 'production') {
      // Allow credentials for cross-origin requests
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Set origin based on the request's origin header
      if (req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
    }
    
    // Only authenticated admin users can get tokens
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        isAuthenticated: false
      });
    }
    
    // Only admin users can request tokens (for security)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Admin privileges required",
        isAuthenticated: true
      });
    }
    
    // Generate a temporary auth token
    const timestamp = Date.now();
    const userId = req.user.id;
    const tokenData = `${userId}.${timestamp}`;
    const hash = generateResetToken().substring(0, 16); // Use 16 chars of a reset token as hash
    const authToken = `${tokenData}.${hash}`;
    
    return res.json({
      success: true,
      isAuthenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      },
      authToken: authToken,
      tokenExpires: new Date(timestamp + 15 * 60 * 1000) // 15 minutes from now
    });
  });
  
  // Add a detailed authentication diagnostics endpoint for troubleshooting
  app.get("/api/auth/diagnostics", (req, res) => {
    // This endpoint provides detailed diagnostics about the current authentication status
    // It's helpful for cross-domain debugging in production but doesn't expose sensitive info
    
    console.log("Auth diagnostics requested", {
      path: req.path,
      method: req.method,
      headers: {
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer,
        cookie: req.headers.cookie ? "Present" : "None"
      },
      ip: req.ip,
      secure: req.secure,
      protocol: req.protocol
    });
    
    // For production environments, add CORS headers to support cross-domain requests
    if (process.env.NODE_ENV === 'production') {
      // Allow credentials for cross-origin requests
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Set origin based on the request's origin header
      if (req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
    }
    
    // Send back diagnostic information 
    res.json({
      auth: {
        isAuthenticated: req.isAuthenticated(),
        hasUser: !!req.user,
        userRole: req.user?.role,
        userId: req.user?.id,
      },
      session: {
        hasSession: !!req.session,
        sessionID: req.sessionID ? req.sessionID.substring(0, 8) + "..." : null,
        cookie: req.session?.cookie ? {
          maxAge: req.session.cookie.maxAge,
          expires: req.session.cookie.expires,
          httpOnly: req.session.cookie.httpOnly,
          secure: req.session.cookie.secure,
          sameSite: req.session.cookie.sameSite,
          path: req.session.cookie.path,
          domain: req.session.cookie.domain || "not set"
        } : null
      },
      request: {
        hasCookies: !!req.headers.cookie,
        origin: req.headers.origin || null,
        host: req.headers.host,
        referer: req.headers.referer || null,
        protocol: req.protocol,
        secure: req.secure,
        isProduction: process.env.NODE_ENV === 'production'
      }
    });
  });
}