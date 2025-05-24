import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal, varchar, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { 
  analyticsSessions, analyticsPageViews, analyticsEvents,
  analyticsSessionsRelations, analyticsPageViewsRelations, analyticsEventsRelations, 
  analyticsSessionsIndexes, analyticsPageViewsIndexes, analyticsEventsIndexes
} from './analytics-schema';

// Re-export analytics schema
export {
  analyticsSessions, analyticsPageViews, analyticsEvents,
  analyticsSessionsRelations, analyticsPageViewsRelations, analyticsEventsRelations,
  analyticsSessionsIndexes, analyticsPageViewsIndexes, analyticsEventsIndexes
};

// Define user roles - expanded structure
export const UserRole = {
  GUEST: 'guest',
  REGISTERED: 'registered',
  BADGE_HOLDER: 'badge_holder',
  PAID: 'paid',
  MODERATOR: 'moderator',
  ADMIN: 'admin'
} as const;

// Define listing types
export const ListingType = {
  FSBO: 'FSBO',
  AGENT: 'Agent',
  RENT: 'Rent',
  OPEN_HOUSE: 'OpenHouse',
  WANTED: 'Wanted',
  CLASSIFIED: 'Classified',
  GARAGE_SALE: 'GarageSale'
} as const;

export type ListingType = typeof ListingType[keyof typeof ListingType];

// Define listing status types
export const ListingStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED'
} as const;

export type ListingStatus = typeof ListingStatus[keyof typeof ListingStatus];

// Define listing duration types with their day counts
export const ListingDurationType = {
  THREE_DAY: '3_day',
  SEVEN_DAY: '7_day',
  THIRTY_DAY: '30_day'
} as const;

export type ListingDurationType = typeof ListingDurationType[keyof typeof ListingDurationType];

// Pricing constants for different listing durations and types
export const ListingPrices = {
  // Real Property (FSBO, FSBA, FOR RENT, WANTED)
  REAL_PROPERTY: {
    [ListingDurationType.THREE_DAY]: null, // Not available
    [ListingDurationType.SEVEN_DAY]: null, // Not available
    [ListingDurationType.THIRTY_DAY]: 5000, // $50.00 (stored in cents)
  },
  // Open houses/Garage sales
  OPEN_HOUSE: {
    [ListingDurationType.THREE_DAY]: 1000, // $10.00
    [ListingDurationType.SEVEN_DAY]: 2500, // $25.00
    [ListingDurationType.THIRTY_DAY]: 5000, // $50.00
  },
  // Classified ads
  CLASSIFIED: {
    [ListingDurationType.THREE_DAY]: 1000, // $10.00
    [ListingDurationType.SEVEN_DAY]: 2500, // $25.00
    [ListingDurationType.THIRTY_DAY]: 5000, // $50.00
  },
  // Default pricing fallback
  DEFAULT: {
    [ListingDurationType.THREE_DAY]: 1000, // $10.00
    [ListingDurationType.SEVEN_DAY]: 2500, // $25.00
    [ListingDurationType.THIRTY_DAY]: 5000, // $50.00
  }
} as const;

// Update users table definition
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isResident: boolean("is_resident").notNull().default(false),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  avatarUrl: text("avatar_url"),
  residentTags: text("resident_tags").array(),
  role: text("role").notNull().default(UserRole.REGISTERED),
  // isApproved field has been removed as it's no longer needed
  isBlocked: boolean("is_blocked").notNull().default(false), // Added to track blocked users separately
  blockReason: text("block_reason"), // Optional reason for blocking
  // Password reset fields
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires"),
  // Barefoot Bay survey questions
  // Resident section
  isLocalResident: boolean("is_local_resident").default(false),
  ownsHomeInBB: boolean("owns_home_in_bb").default(false),
  rentsHomeInBB: boolean("rents_home_in_bb").default(false),
  isFullTimeResident: boolean("is_full_time_resident").default(false),
  isSnowbird: boolean("is_snowbird").default(false),
  hasMembershipBadge: boolean("has_membership_badge").default(false),
  membershipBadgeNumber: text("membership_badge_number"),
  buysDayPasses: boolean("buys_day_passes").default(false),
  // Non-resident section
  hasLivedInBB: boolean("has_lived_in_bb").default(false),
  hasVisitedBB: boolean("has_visited_bb").default(false),
  neverVisitedBB: boolean("never_visited_bb").default(false),
  hasFriendsInBB: boolean("has_friends_in_bb").default(false),
  consideringMovingToBB: boolean("considering_moving_to_bb").default(false),
  wantToDiscoverBB: boolean("want_to_discover_bb").default(false),
  neverHeardOfBB: boolean("never_heard_of_bb").default(false),
  // Square integration fields
  squareCustomerId: text("square_customer_id"), // Square customer profile ID
  
  // Subscription information
  subscriptionId: text("subscription_id"), // Square subscription ID
  subscriptionType: text("subscription_type"), // 'monthly' or 'annual'
  subscriptionStatus: text("subscription_status"), // 'active', 'cancelled', 'past_due'
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Update real estate listings table with new fields
export const realEstateListings = pgTable("real_estate_listings", {
  id: serial("id").primaryKey(),
  listingType: text("listing_type").notNull(), // 'FSBO', 'Agent', 'Rent', 'OpenHouse', 'Wanted', 'Classified'
  category: text("category"), // For classifieds: 'Garage Sale', 'Furniture', etc.
  title: text("title").notNull(),
  price: integer("price"),
  address: text("address"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  squareFeet: integer("square_feet"),
  yearBuilt: integer("year_built"),
  description: text("description"),
  photos: text("photos").array(),
  cashOnly: boolean("cash_only").default(false),
  openHouseDate: timestamp("open_house_date"),
  openHouseStartTime: text("open_house_start_time"),
  openHouseEndTime: text("open_house_end_time"),
  contactInfo: jsonb("contact_info").notNull(),
  // isApproved field has been removed as it's no longer needed
  
  // Listing status field (DRAFT, ACTIVE, EXPIRED)
  status: text("status").default(ListingStatus.DRAFT).notNull(),
  
  // Fields for subscription and expiration
  expirationDate: timestamp("expiration_date"),
  listingDuration: text("listing_duration"), // '3_day', '7_day', '30_day'
  isSubscription: boolean("is_subscription").default(false),
  subscriptionId: text("subscription_id"), // Square subscription ID
  
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Add this type definition after the existing imports

export type DaySchedule = {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
};

export type OperatingHours = Record<string, DaySchedule>;

// Define recurrence frequency types
export const RecurrenceFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

// Update the events table definition to support recurring events and hours of operation
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  location: text("location"),
  mapLink: text("map_link"),
  hoursOfOperation: jsonb("hours_of_operation"), // JSONB type for hours of operation
  category: text("category").notNull(),
  contactInfo: jsonb("contact_info"),
  mediaUrls: text("media_urls").array(),
  
  // Badge requirement field
  badgeRequired: boolean("badge_required").default(false), // Whether a membership badge is required
  
  // Recurring event fields
  isRecurring: boolean("is_recurring").default(false),
  recurrenceFrequency: text("recurrence_frequency"), // daily, weekly, biweekly, monthly, yearly
  recurrenceEndDate: timestamp("recurrence_end_date"), // When the recurring event series ends
  parentEventId: integer("parent_event_id").references(() => events.id), // For child events in a recurring series
  
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// New table for event interactions
export const eventInteractions = pgTable("event_interactions", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  interactionType: text("interaction_type").notNull(), // 'like', 'going', 'interested'
  createdAt: timestamp("created_at").defaultNow(),
});

// New table for event comments
export const eventComments = pgTable("event_comments", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Add after the existing table definitions
export const pageContents = pgTable("page_contents", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(), // e.g. "amenities#golf"
  title: text("title").notNull(),
  content: text("content").notNull(),
  mediaUrls: text("media_urls").array(),
  isHidden: boolean("is_hidden").notNull().default(false), // To hide pages like vendor pages
  order: integer("order").default(0), // Added for controlling display order
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Content versions table stores revision history
export const contentVersions = pgTable("content_versions", {
  id: serial("id").primaryKey(),
  contentId: integer("content_id").notNull().references(() => pageContents.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  mediaUrls: text("media_urls").array(),
  createdBy: integer("created_by").references(() => users.id),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  notes: text("notes").default(""),
});

// Create base schemas
const baseUserSchema = createInsertSchema(users);
const baseEventSchema = createInsertSchema(events);
const baseListingSchema = createInsertSchema(realEstateListings);
const baseEventInteractionSchema = createInsertSchema(eventInteractions);
const baseEventCommentSchema = createInsertSchema(eventComments);
const basePageContentSchema = createInsertSchema(pageContents);
const baseContentVersionSchema = createInsertSchema(contentVersions);

// Note: Analytics tables are now defined in analytics-schema.ts and re-exported above

// Export the schemas with additional validation
export const insertUserSchema = baseUserSchema
  .omit({ id: true })
  .extend({
    // Square integration fields
    squareCustomerId: z.string().optional(),
    // Add subscription field validations
    subscriptionId: z.string().optional(),
    subscriptionType: z.enum(['monthly', 'annual']).optional(),
    subscriptionStatus: z.enum(['active', 'cancelled', 'past_due']).optional(),
    subscriptionStartDate: z.coerce.date().optional(),
    subscriptionEndDate: z.coerce.date().optional(),
    // Additional survey fields
    rentsHomeInBB: z.boolean().optional().default(false),
    buysDayPasses: z.boolean().optional().default(false),
    hasVisitedBB: z.boolean().optional().default(false),
    neverVisitedBB: z.boolean().optional().default(false),
    hasFriendsInBB: z.boolean().optional().default(false),
    wantToDiscoverBB: z.boolean().optional().default(false),
    neverHeardOfBB: z.boolean().optional().default(false),
  });

const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

// Update the insertEventSchema with recurring event fields
export const insertEventSchema = baseEventSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Required fields
    title: z.string().min(1, "Event title is required"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    location: z.string().min(1, "Location is required"),
    category: z.enum(["entertainment", "government", "social"]),

    // Optional fields
    description: z.string().optional().nullable(),
    businessName: z.string().optional().nullable(),
    badgeRequired: z.boolean().optional().default(false), // Whether a membership badge is required
    contactInfo: z.object({
      name: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      website: z.string().optional().nullable()
    }).optional().default({}),
    hoursOfOperation: z.record(z.object({
      isOpen: z.boolean(),
      openTime: z.string(),
      closeTime: z.string(),
    })).nullable().optional(),
    mediaUrls: z.array(z.string()).optional(),
    
    // Recurring event fields
    isRecurring: z.boolean().optional().default(false),
    recurrenceFrequency: z.enum([
      RecurrenceFrequency.DAILY,
      RecurrenceFrequency.WEEKLY,
      RecurrenceFrequency.BIWEEKLY,
      RecurrenceFrequency.MONTHLY,
      RecurrenceFrequency.YEARLY
    ]).nullable().optional(),
    recurrenceEndDate: z.coerce.date().nullable().optional(),
    parentEventId: z.number().optional(),
  })
  .refine((data) => {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    return endDate > startDate;
  }, {
    message: "End date must be after start date",
    path: ["endDate"],
  })
  .refine((data) => {
    // If it's a recurring event, recurrence fields are required
    if (data.isRecurring) {
      return !!data.recurrenceFrequency && !!data.recurrenceEndDate;
    }
    return true;
  }, {
    message: "Recurring events must have a frequency and end date",
    path: ["recurrenceEndDate"],
  });

export const insertEventInteractionSchema = baseEventInteractionSchema.omit({ id: true, createdAt: true });
export const insertEventCommentSchema = baseEventCommentSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const insertListingSchema = baseListingSchema
  .omit({ id: true, createdAt: true, updatedAt: true, isApproved: true })
  .extend({
    listingType: z.enum(['FSBO', 'Agent', 'Rent', 'OpenHouse', 'Wanted', 'Classified', 'GarageSale']),
    category: z.string().optional(),
    price: z.number().min(0).optional(),
    address: z.string().optional(),
    bedrooms: z.number().min(0).optional(),
    bathrooms: z.number().min(0).optional(),
    squareFeet: z.number().min(0).optional(),
    yearBuilt: z.number().optional(),
    photos: z.array(z.string()).optional(),
    contactInfo: z.object({
      name: z.string().min(1, "Name is required"),
      phone: z.string().regex(phoneRegex, "Phone number must be in format (555) 555-5555"),
      email: z.string().email("Invalid email address"),
    }),
    
    // Status field (DRAFT, ACTIVE, EXPIRED)
    status: z.enum([
      ListingStatus.DRAFT, 
      ListingStatus.ACTIVE, 
      ListingStatus.EXPIRED
    ]).default(ListingStatus.DRAFT),
    
    // Subscription and expiration fields
    expirationDate: z.date().nullable().optional(),
    // More flexible listingDuration field that accepts multiple formats and normalizes them
    listingDuration: z.union([
      z.enum([
        ListingDurationType.THREE_DAY,
        ListingDurationType.SEVEN_DAY,
        ListingDurationType.THIRTY_DAY
      ]), 
      // Also allow just the number part
      z.enum(['3', '7', '30']),
      // Also allow format without underscore
      z.enum(['3day', '7day', '30day'])
    ]).transform(val => {
      // Normalize to the proper format with underscore
      if (val === '3' || val === '3day') return ListingDurationType.THREE_DAY;
      if (val === '7' || val === '7day') return ListingDurationType.SEVEN_DAY;
      if (val === '30' || val === '30day') return ListingDurationType.THIRTY_DAY;
      return val;
    }).optional(),
    isSubscription: z.boolean().optional().default(false),
    subscriptionId: z.string().optional(),
  })
  .refine((data) => {
    // Property listings must have address and price
    if (['FSBO', 'Agent', 'Rent', 'OpenHouse'].includes(data.listingType)) {
      return data.address && data.price && data.bedrooms && data.bathrooms && data.squareFeet && data.yearBuilt;
    }
    return true;
  }, {
    message: "Property listings require complete property details",
  });

// Add after the existing schema definitions
/**
 * Migration schema for tracking the migration status of media files
 * This helps track which files have been migrated to Object Storage
 */
export const migrationRecords = pgTable("migration_records", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'filesystem' or 'postgresql'
  sourceLocation: text("source_location").notNull(), // Original file path or database reference
  mediaBucket: text("media_bucket").notNull(), // Target bucket in object storage
  mediaType: text("media_type").notNull(), // Media type (calendar, forum, etc.)
  storageKey: text("storage_key").notNull(), // Object storage key
  migrationStatus: text("migration_status").notNull(), // 'pending', 'migrated', 'failed'
  errorMessage: text("error_message"), // Error message if failed
  migratedAt: timestamp("migrated_at"), // When the file was migrated
  verificationStatus: boolean("verification_status").default(false), // Whether file was verified in object storage
  verifiedAt: timestamp("verified_at"), // When the file was verified
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Export migration record types
export type MigrationRecord = typeof migrationRecords.$inferSelect;
export type InsertMigrationRecord = typeof migrationRecords.$inferInsert;

export const insertPageContentSchema = basePageContentSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    title: z.string().min(1, "Title is required"),
    content: z.string().min(1, "Content is required"),
    mediaUrls: z.array(z.string()).optional().default([]),
    isHidden: z.boolean().optional().default(false),
    order: z.number().optional().default(0),
  });

export const insertContentVersionSchema = baseContentVersionSchema
  .omit({ id: true, createdAt: true })
  .extend({
    contentId: z.number(),
    slug: z.string(),
    title: z.string().min(1, "Title is required"),
    content: z.string().min(1, "Content is required"),
    mediaUrls: z.array(z.string()).optional().default([]),
    versionNumber: z.number(),
    notes: z.string().optional(),
  });


// Export types
export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventInteraction = typeof eventInteractions.$inferSelect;
export type EventComment = typeof eventComments.$inferSelect;
export type RealEstateListing = typeof realEstateListings.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertEventInteraction = z.infer<typeof insertEventInteractionSchema>;
export type InsertEventComment = z.infer<typeof insertEventCommentSchema>;
export type InsertListing = z.infer<typeof insertListingSchema>;
export type PageContent = typeof pageContents.$inferSelect;
export type InsertPageContent = z.infer<typeof insertPageContentSchema>;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type InsertContentVersion = z.infer<typeof insertContentVersionSchema>;

// Add these type definitions after the existing types
export type InteractionWithUser = EventInteraction & {
  user?: {
    id: number;
    username: string;
    avatarUrl: string | null;
    isResident?: boolean;
  };
};

export type CommentWithUser = EventComment & {
  user?: {
    id: number;
    username: string;
    avatarUrl: string | null;
    isResident?: boolean;
  };
};

export type VendorCommentWithUser = VendorComment & {
  user?: {
    id: number;
    username: string;
    avatarUrl: string | null;
    isResident?: boolean;
  };
};

export type VendorInteractionWithUser = VendorInteraction & {
  user?: {
    id: number;
    username: string;
    avatarUrl: string | null;
    isResident?: boolean;
  };
};

// New table for listing payments
export const listingPayments = pgTable("listing_payments", {
  id: serial("id").primaryKey(),
  userId: integer("userid").references(() => users.id).notNull(), // Match the actual database column name
  listingId: integer("listingid").references(() => realEstateListings.id),
  amount: integer("amount").notNull(), // Amount in cents
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(), // 'pending', 'completed', 'failed'
  paymentIntentId: text("paymentintentid"), // Stripe/Square payment intent ID
  discountCode: text("discountcode"),
  listingType: text("listing_type"), // Type of listing (FSBO, CLASSIFIED, etc.)
  listingDuration: text("listing_duration"), // Duration of listing (3_day, 7_day, 30_day)
  isSubscription: boolean("is_subscription").default(false), // Whether this payment is for a subscription
  subscriptionId: text("subscription_id"), // Square subscription ID
  subscriptionPlan: text("subscription_plan"), // MONTHLY, QUARTERLY, etc.
  createdAt: timestamp("createdat").defaultNow(),
  updatedAt: timestamp("updatedat").defaultNow(),
});

// Create base schema for listing payments
const baseListingPaymentSchema = createInsertSchema(listingPayments);

// Export the schema with additional validation
export const insertListingPaymentSchema = baseListingPaymentSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    amount: z.number().min(0),
    currency: z.string().default("usd"),
    status: z.enum(["pending", "completed", "failed"]),
    paymentIntentId: z.string().optional(),
    discountCode: z.string().optional(),
    listingType: z.enum([
      ListingType.FSBO, 
      ListingType.AGENT, 
      ListingType.RENT, 
      ListingType.OPEN_HOUSE, 
      ListingType.WANTED, 
      ListingType.CLASSIFIED,
      ListingType.GARAGE_SALE
    ]).optional(),
    listingDuration: z.enum([
      ListingDurationType.THREE_DAY,
      ListingDurationType.SEVEN_DAY,
      ListingDurationType.THIRTY_DAY
    ]).optional(),
    isSubscription: z.boolean().default(false),
    subscriptionId: z.string().optional(),
    subscriptionPlan: z.string().optional(),
  });

export type ListingPayment = typeof listingPayments.$inferSelect;
export type InsertListingPayment = z.infer<typeof insertListingPaymentSchema>;

// Define product-related constants
export const ProductCategory = {
  APPAREL: 'apparel',
  HOME: 'home',
  ACCESSORIES: 'accessories',
  SPONSORSHIP: 'sponsorship',
  MEMBERSHIPS: 'memberships',
  ALL: 'all',
} as const;

export const ProductStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DRAFT: 'draft',
} as const;

export const PrintProvider = {
  PRINTFUL: 'printful',
  PRINTIFY: 'printify',
  GOOTEN: 'gooten',
} as const;

// Store products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  imageUrls: text("image_urls").array(),
  status: text("status").notNull().default(ProductStatus.DRAFT),
  featured: boolean("featured").default(false), // Flag for featured products
  
  // Print-on-demand specific fields
  printProviderId: text("print_provider_id"), // External ID from the print provider
  printProvider: text("print_provider"), // 'printful', 'printify', etc.
  variantData: jsonb("variant_data"), // Store color, size, and other variant info
  designUrls: text("design_urls").array(), // URLs to design files
  mockupUrls: text("mockup_urls").array(), // URLs to mockup images

  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Create base schema for products
const baseProductSchema = createInsertSchema(products);

// Export the schema with additional validation
export const insertProductSchema = baseProductSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1, "Product name is required"),
    description: z.string().optional(),
    price: z.number().min(0, "Price cannot be negative"),
    category: z.enum([ProductCategory.APPAREL, ProductCategory.HOME, ProductCategory.ACCESSORIES, ProductCategory.SPONSORSHIP, ProductCategory.MEMBERSHIPS, ProductCategory.ALL]),
    imageUrls: z.array(z.string()).default([]),
    status: z.enum([ProductStatus.ACTIVE, ProductStatus.INACTIVE, ProductStatus.DRAFT]).default(ProductStatus.DRAFT),
    featured: z.boolean().default(false), // Flag for featured products
    
    // Print-on-demand fields
    printProviderId: z.string().optional(),
    printProvider: z.enum([PrintProvider.PRINTFUL, PrintProvider.PRINTIFY, PrintProvider.GOOTEN]).optional(),
    variantData: z.record(z.any()).optional(),
    designUrls: z.array(z.string()).default([]),
    mockupUrls: z.array(z.string()).default([]),
  });

// Order status enum
export const OrderStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  RETURNED: "returned",
  RETURN_REQUESTED: "return_requested",
  RETURN_APPROVED: "return_approved",
  RETURN_SHIPPED: "return_shipped",
  RETURN_RECEIVED: "return_received",
  REFUNDED: "refunded",
} as const;

// Order table for product purchases
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  status: text("status").notNull(), // 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  shippingAddress: jsonb("shipping_address").notNull(),
  paymentIntentId: text("payment_intent_id"), // For external payment service reference
  discountCode: text("discount_code"), // Store the applied discount code
  squareOrderId: text("square_order_id"), // Square order ID for tracking
  printProviderOrderId: text("print_provider_order_id"), // External order ID from print provider
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Order item table
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  variantInfo: jsonb("variant_info"), // Store selected size, color, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Create base schemas for orders and order items
const baseOrderSchema = createInsertSchema(orders);
const baseOrderItemSchema = createInsertSchema(orderItems);

// Export the schemas with additional validation
// Return reason enum
export const ReturnReason = {
  WRONG_SIZE: "wrong_size",
  WRONG_ITEM: "wrong_item",
  DEFECTIVE: "defective",
  NOT_AS_DESCRIBED: "not_as_described",
  CHANGED_MIND: "changed_mind",
  OTHER: "other",
} as const;

// Return status enum
export const ReturnStatus = {
  REQUESTED: "requested",
  APPROVED: "approved",
  DENIED: "denied",
  LABEL_CREATED: "label_created",
  SHIPPED: "shipped",
  RECEIVED: "received",
  REFUNDED: "refunded",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

// Returns table for tracking product returns
export const orderReturns = pgTable("order_returns", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  status: text("status").notNull().default(ReturnStatus.REQUESTED),
  reason: text("reason").notNull(),
  notes: text("notes"),
  reasonDetails: text("reason_details"),
  imageUrls: text("image_urls").array(), // Photos of the issue if applicable
  returnLabelUrl: text("return_label_url"),
  trackingNumber: text("tracking_number"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),
  refundId: text("refund_id"), // Reference to Square refund ID
  printfulReturnId: text("printful_return_id"), // Printful return reference
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Return items table to track which items are being returned
export const returnItems = pgTable("return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").references(() => orderReturns.id).notNull(),
  orderItemId: integer("order_item_id").references(() => orderItems.id).notNull(),
  quantity: integer("quantity").notNull(),
  reason: text("reason").notNull(),
  reasonDetails: text("reason_details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Create base schemas for returns and return items
const baseOrderReturnSchema = createInsertSchema(orderReturns);
const baseReturnItemSchema = createInsertSchema(returnItems);

export const insertOrderSchema = baseOrderSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum([
      'pending', 'processing', 'shipped', 'delivered', 'cancelled',
      'return_requested', 'return_approved', 'return_shipped', 'return_received', 'refunded', 'returned'
    ]).default('pending'),
    total: z.number().min(0),
    shippingAddress: z.object({
      fullName: z.string().min(1, "Full name is required"),
      streetAddress: z.string().min(1, "Street address is required"),
      city: z.string().min(1, "City is required"),
      state: z.string().min(1, "State is required"),
      zipCode: z.string().min(5, "Zip code is required"),
      country: z.string().min(1, "Country is required"),
      phone: z.string().optional(),
    }),
    paymentIntentId: z.string().optional(),
    discountCode: z.string().optional(),
    squareOrderId: z.string().optional(),
    printProviderOrderId: z.string().optional(),
    trackingNumber: z.string().optional(),
    trackingUrl: z.string().optional(),
  });

export const insertOrderItemSchema = baseOrderItemSchema
  .omit({ id: true, createdAt: true })
  .extend({
    quantity: z.number().min(1, "Quantity must be at least 1"),
    price: z.number().min(0, "Price cannot be negative"),
    variantInfo: z.record(z.any()).optional(),
  });

// Form field types enum
export const FormFieldType = {
  TEXT: "text",
  EMAIL: "email",
  PHONE: "phone",
  TEXTAREA: "textarea",
  CHECKBOX: "checkbox",
  SELECT: "select",
  RADIO: "radio",
  FILE: "file",
} as const;

// Custom forms table - used to define form structures
// Custom forms table for embedded forms
// Note on form deletion: When a form is deleted through deleteCustomForm(),
// a shadow copy with a negative ID (e.g., -11 for form 11) is created, 
// and all submissions are updated to reference this negative ID before
// the original form is deleted. This preserves form submissions for reporting
// while removing the form itself from the website.
export const customForms = pgTable("custom_forms", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  formFields: jsonb("form_fields").notNull(), // Array of field definitions
  termsAndConditions: text("terms_and_conditions"), // Optional T&C text
  requiresTermsAcceptance: boolean("requires_terms_acceptance").default(false),
  slug: text("slug").notNull().unique(), // Unique identifier for the form
  pageContentId: integer("page_content_id").references(() => pageContents.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Form submissions table - stores user responses to custom forms
// Note: When a form is deleted, submissions are preserved by updating their
// formId to reference a "shadow copy" of the form with a negative ID.
// For example, if form ID 11 is deleted, its submissions will reference
// form ID -11, and a shadow record will be created in the custom_forms table
// with ID -11 to maintain the foreign key constraint.
export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => customForms.id).notNull(),
  userId: integer("user_id").references(() => users.id), // Optional, for authenticated users
  submitterEmail: text("submitter_email"), // For collecting email from non-authenticated users
  formData: jsonb("form_data").notNull(), // JSON object with the form responses
  fileUploads: text("file_uploads").array(), // Array of file upload paths
  termsAccepted: boolean("terms_accepted").default(false),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Create base schemas for forms and submissions
const baseCustomFormSchema = createInsertSchema(customForms);
const baseFormSubmissionSchema = createInsertSchema(formSubmissions);

// Export the schemas with additional validation
export const insertCustomFormSchema = baseCustomFormSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    title: z.string().min(1, "Form title is required"),
    description: z.string().optional(),
    formFields: z.array(z.object({
      id: z.string(), // Unique ID for the field
      type: z.enum([
        FormFieldType.TEXT, 
        FormFieldType.EMAIL, 
        FormFieldType.PHONE, 
        FormFieldType.TEXTAREA,
        FormFieldType.CHECKBOX,
        FormFieldType.SELECT,
        FormFieldType.RADIO,
        FormFieldType.FILE
      ]),
      label: z.string().min(1, "Field label is required"),
      placeholder: z.string().optional(),
      required: z.boolean().default(false),
      order: z.number().int().nonnegative(),
      options: z.array(z.string()).optional(), // For select/radio/checkbox fields
      maxLength: z.number().int().positive().optional(),
      helperText: z.string().optional(),
      validationRegex: z.string().optional(),
      validationMessage: z.string().optional(),
    })),
    termsAndConditions: z.string().optional(),
    requiresTermsAcceptance: z.boolean().default(false),
    slug: z.string().min(1, "Form slug is required"),
  });

export const insertFormSubmissionSchema = baseFormSubmissionSchema
  .omit({ id: true, createdAt: true })
  .extend({
    formId: z.number().int().positive(),
    userId: z.number().int().positive().optional(),
    submitterEmail: z.string().email().optional(),
    formData: z.record(z.any()),
    fileUploads: z.array(z.string()).optional(),
    termsAccepted: z.boolean().default(false),
    ipAddress: z.string().optional(),
  });

// Export the types
export type CustomForm = typeof customForms.$inferSelect;
export type InsertCustomForm = z.infer<typeof insertCustomFormSchema>;

/**
 * FormSubmission type augmented with metadata for tracking deleted forms
 * 
 * When a form is deleted, we create a shadow copy with a negative ID and update 
 * all form submissions to point to that negative ID. This allows us to:
 * 
 * 1. Preserve all user submission data for reporting and compliance
 * 2. Remove the form from the website to prevent new submissions
 * 3. Show a visual indicator in the admin UI for submissions from deleted forms
 * 
 * The _deletedForm flag is set by the getAllFormSubmissions() and getFormSubmission()
 * methods in storage.ts when they detect a negative formId.
 */
export type FormSubmission = typeof formSubmissions.$inferSelect & {
  _deletedForm?: boolean; // Flag to indicate if the form was deleted (has negative formId)
};

export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormField = z.infer<typeof insertCustomFormSchema>["formFields"][0];

// Add return-related schemas
export const insertOrderReturnSchema = baseOrderReturnSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum([
      ReturnStatus.REQUESTED,
      ReturnStatus.APPROVED,
      ReturnStatus.DENIED,
      ReturnStatus.LABEL_CREATED,
      ReturnStatus.SHIPPED,
      ReturnStatus.RECEIVED,
      ReturnStatus.REFUNDED,
      ReturnStatus.COMPLETED,
      ReturnStatus.CANCELLED,
    ]).default(ReturnStatus.REQUESTED),
    reason: z.enum([
      ReturnReason.WRONG_SIZE,
      ReturnReason.WRONG_ITEM,
      ReturnReason.DEFECTIVE,
      ReturnReason.NOT_AS_DESCRIBED,
      ReturnReason.CHANGED_MIND,
      ReturnReason.OTHER,
    ]),
    notes: z.string().optional(),
    reasonDetails: z.string().optional(),
    imageUrls: z.array(z.string()).optional(),
    returnLabelUrl: z.string().optional(),
    trackingNumber: z.string().optional(),
    refundAmount: z.number().min(0).optional(),
    refundId: z.string().optional(),
    printfulReturnId: z.string().optional(),
    adminNotes: z.string().optional(),
  });

export const insertReturnItemSchema = baseReturnItemSchema
  .omit({ id: true, createdAt: true })
  .extend({
    quantity: z.number().min(1, "Quantity must be at least 1"),
    reason: z.enum([
      ReturnReason.WRONG_SIZE,
      ReturnReason.WRONG_ITEM,
      ReturnReason.DEFECTIVE,
      ReturnReason.NOT_AS_DESCRIBED,
      ReturnReason.CHANGED_MIND,
      ReturnReason.OTHER,
    ]),
    reasonDetails: z.string().optional(),
  });

// Forum tables

// Forum header description 
export const forumDescription = pgTable("forum_description", {
  id: serial("id").primaryKey(),
  content: text("content").notNull().default(''),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Forum categories
export const forumCategories = pgTable("forum_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  icon: text("icon"), // Icon name for the category
  order: integer("order").default(0), // For controlling display order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Forum posts
export const forumPosts = pgTable("forum_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => forumCategories.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  isPinned: boolean("is_pinned").default(false),
  isLocked: boolean("is_locked").default(false),
  views: integer("views").default(0),
  mediaUrls: text("media_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Forum comments/replies
export const forumComments = pgTable("forum_comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  postId: integer("post_id").references(() => forumPosts.id).notNull(),
  authorId: integer("author_id").references(() => users.id).notNull(), // Using authorId instead of userId to match database
  parentCommentId: integer("parent_comment_id").references(() => forumComments.id), // For nested replies
  mediaUrls: text("media_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Forum reactions (likes, etc.)
export const forumReactions = pgTable("forum_reactions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => forumPosts.id),
  commentId: integer("comment_id").references(() => forumComments.id),
  userId: integer("user_id").references(() => users.id).notNull(),
  reactionType: text("reaction_type").notNull(), // 'like', 'thumbsup', etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Create base schemas for forum tables
const baseForumCategorySchema = createInsertSchema(forumCategories);
const baseForumPostSchema = createInsertSchema(forumPosts);
const baseForumCommentSchema = createInsertSchema(forumComments);
const baseForumReactionSchema = createInsertSchema(forumReactions);
const baseForumDescriptionSchema = createInsertSchema(forumDescription);

// Export the schemas with additional validation
export const insertForumCategorySchema = baseForumCategorySchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(2, "Category name is required and must be at least 2 characters"),
    description: z.string().optional(),
    slug: z.string().min(2, "Slug is required"),
    icon: z.string().optional(),
    order: z.number().optional(),
  });

export const insertForumPostSchema = baseForumPostSchema
  .omit({ id: true, createdAt: true, updatedAt: true, views: true })
  .extend({
    title: z.string().min(3, "Post title is required and must be at least 3 characters"),
    content: z.string().min(10, "Post content is required and must be at least 10 characters"),
    categoryId: z.number(),
    isPinned: z.boolean().optional().default(false),
    isLocked: z.boolean().optional().default(false),
    mediaUrls: z.array(z.string()).optional().default([]),
  });

export const insertForumCommentSchema = baseForumCommentSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    content: z.string().min(1, "Comment content is required"),
    postId: z.number(),
    authorId: z.number(), // Changed from userId to authorId to match the database column
    parentCommentId: z.number().optional(),
    mediaUrls: z.array(z.string()).optional().default([]),
  });

export const insertForumReactionSchema = baseForumReactionSchema
  .omit({ id: true, createdAt: true })
  .extend({
    postId: z.number().optional(),
    commentId: z.number().optional(),
    reactionType: z.string(),
  })
  .refine((data) => {
    // Either postId or commentId must be provided, but not both
    return (data.postId && !data.commentId) || (!data.postId && data.commentId);
  }, {
    message: "Either postId or commentId must be provided, but not both",
  });

export const insertForumDescriptionSchema = baseForumDescriptionSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    content: z.string(),
  });

// Export the types
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderReturn = typeof orderReturns.$inferSelect;
export type InsertOrderReturn = z.infer<typeof insertOrderReturnSchema>;
export type ReturnItem = typeof returnItems.$inferSelect;
export type InsertReturnItem = z.infer<typeof insertReturnItemSchema>;
export type ForumCategory = typeof forumCategories.$inferSelect;
export type InsertForumCategory = z.infer<typeof insertForumCategorySchema>;
export type ForumPost = typeof forumPosts.$inferSelect;
export type InsertForumPost = z.infer<typeof insertForumPostSchema>;
export type ForumComment = typeof forumComments.$inferSelect;
export type InsertForumComment = z.infer<typeof insertForumCommentSchema>;
export type ForumReaction = typeof forumReactions.$inferSelect;
export type InsertForumReaction = z.infer<typeof insertForumReactionSchema>;
export type ForumDescription = typeof forumDescription.$inferSelect;
export type InsertForumDescription = z.infer<typeof insertForumDescriptionSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type MessageRecipient = typeof messageRecipients.$inferSelect;
export type InsertMessageRecipient = z.infer<typeof insertMessageRecipientSchema>;

// Vendor comments table for vendors pages
export const vendorComments = pgTable("vendor_comments", {
  id: serial("id").primaryKey(),
  pageSlug: text("page_slug").notNull(), // Vendor page slug
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vendor interactions table (likes, etc.)
export const vendorInteractions = pgTable("vendor_interactions", {
  id: serial("id").primaryKey(),
  pageSlug: text("page_slug").notNull(), // Vendor page slug
  userId: integer("user_id").references(() => users.id).notNull(),
  interactionType: text("interaction_type").notNull(), // 'like', 'recommend', etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Vendor categories table
export const vendorCategories = pgTable("vendor_categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(), // e.g., "home-services"
  name: text("name").notNull().unique(), // e.g., "Home Services"
  icon: text("icon"), // Icon identifier for the category
  order: integer("order").notNull().default(0),
  isHidden: boolean("is_hidden").notNull().default(false), // To hide categories from nav and listings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Community categories table for organizing community pages
export const communityCategories = pgTable("community_categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(), // e.g., "government"
  name: text("name").notNull().unique(), // e.g., "Government & Regulations"
  icon: text("icon"), // Optional icon name for the category (e.g., "Building")
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Create base schemas for vendor comments, interactions and categories
const baseVendorCommentSchema = createInsertSchema(vendorComments);
const baseVendorInteractionSchema = createInsertSchema(vendorInteractions);
const baseVendorCategorySchema = createInsertSchema(vendorCategories);
const baseCommunityCategory = createInsertSchema(communityCategories);

// Export the schemas with additional validation
export const insertVendorCommentSchema = baseVendorCommentSchema
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertVendorInteractionSchema = baseVendorInteractionSchema
  .omit({ id: true, createdAt: true });

export const insertVendorCategorySchema = baseVendorCategorySchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    slug: z.string().min(1, "Slug is required"),
    name: z.string().min(1, "Name is required"),
    icon: z.string().optional(),
    order: z.number().optional().default(0),
    isHidden: z.boolean().optional().default(false),
  });

export const insertCommunityCategorySchema = baseCommunityCategory
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    slug: z.string().min(1, "Slug is required"),
    name: z.string().min(1, "Name is required"),
    icon: z.string().optional(),
    order: z.number().optional().default(0),
  });

export type VendorComment = typeof vendorComments.$inferSelect;
export type InsertVendorComment = z.infer<typeof insertVendorCommentSchema>;
export type VendorInteraction = typeof vendorInteractions.$inferSelect;
export type InsertVendorInteraction = z.infer<typeof insertVendorInteractionSchema>;
export type VendorCategory = typeof vendorCategories.$inferSelect;
export type InsertVendorCategory = z.infer<typeof insertVendorCategorySchema>;
export type CommunityCategory = typeof communityCategories.$inferSelect;
export type InsertCommunityCategory = z.infer<typeof insertCommunityCategorySchema>;

// Define available feature flag names
export const FeatureFlagName = {
  CALENDAR: 'calendar',
  FORUM: 'forum',
  FOR_SALE: 'for_sale',
  STORE: 'store',
  VENDORS: 'vendors',
  COMMUNITY: 'community',
  LAUNCH_SCREEN: 'launch_screen',
  ADMIN: 'admin_access', // Admin feature flag
  WEATHER_ROCKET_ICONS: 'weather_rocket_icons', // Weather and rocket icons in navigation
  MESSAGES: 'messages', // Private messaging between users
} as const;

// Feature flags table to control visibility of features based on user roles
export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // Name of the feature flag (e.g., 'calendar', 'forum')
  displayName: text("display_name").notNull(), // Display name shown in UI (e.g., 'Calendar', 'Forum')
  enabledForRoles: text("enabled_for_roles").array().notNull().default([]), // Array of roles that can access this feature
  description: text("description"), // Description of what this feature does
  isActive: boolean("is_active").notNull().default(true), // Global switch to toggle feature on/off regardless of roles
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Create base schema for feature flags
const baseFeatureFlagSchema = createInsertSchema(featureFlags);

// Export the schema with additional validation
export const insertFeatureFlagSchema = baseFeatureFlagSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.enum([
      FeatureFlagName.CALENDAR,
      FeatureFlagName.FORUM,
      FeatureFlagName.FOR_SALE,
      FeatureFlagName.STORE,
      FeatureFlagName.VENDORS,
      FeatureFlagName.COMMUNITY,
      FeatureFlagName.LAUNCH_SCREEN,
      FeatureFlagName.ADMIN,
      FeatureFlagName.WEATHER_ROCKET_ICONS,
      FeatureFlagName.MESSAGES,
    ]),
    displayName: z.string().min(1, "Display name is required"),
    enabledForRoles: z.array(z.enum([
      UserRole.GUEST,
      UserRole.REGISTERED, 
      UserRole.BADGE_HOLDER,
      UserRole.PAID, 
      UserRole.MODERATOR,
      UserRole.ADMIN
    ])),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
  });

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;

// Site settings table for global site configuration
export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // Unique setting key (e.g., 'rocket_icon')
  value: text("value").notNull(), // Setting value (e.g., URL or JSON string)
  description: text("description"), // Optional description
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Create base schema for site settings
const baseSiteSettingSchema = createInsertSchema(siteSettings);

// Export the schema with additional validation
export const insertSiteSettingSchema = baseSiteSettingSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    key: z.string().min(1, "Setting key is required"),
    value: z.string().min(1, "Setting value is required"),
    description: z.string().optional(),
  });

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;

// Analytics tables are defined earlier in this file (see above)

// Create base schemas for analytics
const baseAnalyticsPageViewSchema = createInsertSchema(analyticsPageViews);
const baseAnalyticsEventSchema = createInsertSchema(analyticsEvents);
const baseAnalyticsSessionSchema = createInsertSchema(analyticsSessions);

// Export the schemas with additional validation
export const insertAnalyticsPageViewSchema = baseAnalyticsPageViewSchema
  .omit({ id: true })
  .extend({
    timestamp: z.coerce.date().optional().default(() => new Date()),
  });

export const insertAnalyticsEventSchema = baseAnalyticsEventSchema
  .omit({ id: true })
  .extend({
    timestamp: z.coerce.date().optional().default(() => new Date()),
    eventData: z.any().optional(),
  });

export const insertAnalyticsSessionSchema = baseAnalyticsSessionSchema
  .omit({ id: true })
  .extend({
    startTimestamp: z.coerce.date().optional().default(() => new Date()),
    // Add validation for geolocation fields
    country: z.string().optional(),
    region: z.string().optional(),
    city: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  });

export type AnalyticsPageView = typeof analyticsPageViews.$inferSelect;
export type InsertAnalyticsPageView = z.infer<typeof insertAnalyticsPageViewSchema>;

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;

export type AnalyticsSession = typeof analyticsSessions.$inferSelect;
export type InsertAnalyticsSession = z.infer<typeof insertAnalyticsSessionSchema>;

// Define message type constants
export const MessageType = {
  DIRECT: 'direct',
  BROADCAST: 'broadcast'
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

// Define message status constants
export const MessageStatus = {
  UNREAD: 'unread',
  READ: 'read',
  ARCHIVED: 'archived'
} as const;

export type MessageStatus = typeof MessageStatus[keyof typeof MessageStatus];

// Messages table for the messaging system
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  messageType: text("message_type").notNull().default(MessageType.DIRECT), // 'direct' or 'broadcast'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  inReplyTo: integer("in_reply_to").references(() => messages.id), // For message threading
});

// Message recipients table to track message delivery and read status
export const messageRecipients = pgTable("message_recipients", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id, { onDelete: 'cascade' }).notNull(),
  recipientId: integer("recipient_id").references(() => users.id).notNull(),
  status: text("status").notNull().default(MessageStatus.UNREAD), // 'unread', 'read', 'archived'
  readAt: timestamp("read_at"),
  targetRole: text("target_role"), // Only used for broadcast messages, can be null for direct messages
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Analytics User Segments Table - stores user segment definitions for analytics filtering
export const analyticsUserSegments = pgTable("analytics_user_segments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true),
  filters: jsonb("filters").notNull(), // JSON object with segment filter criteria
  userCount: integer("user_count"), // Cache of the number of users matching this segment
  lastCalculated: timestamp("last_calculated"), // When the user count was last calculated
});

// Analytics User Segment Filters Table - stores the actual filter rules for user segments
export const analyticsSegmentFilters = pgTable("analytics_segment_filters", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id").references(() => analyticsUserSegments.id).notNull(),
  field: text("field").notNull(), // Field to filter on (device, browser, page_category, etc.)
  operator: text("operator").notNull(), // Operator (equals, contains, greaterThan, lessThan, etc.)
  value: text("value").notNull(), // Value to compare against
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Create base schemas for the messaging system
const baseMessageSchema = createInsertSchema(messages);
const baseMessageRecipientSchema = createInsertSchema(messageRecipients);

// Create base schemas for analytics segments
const baseAnalyticsUserSegmentSchema = createInsertSchema(analyticsUserSegments);
const baseAnalyticsSegmentFilterSchema = createInsertSchema(analyticsSegmentFilters);

// Export the schemas with additional validation
export const insertAnalyticsUserSegmentSchema = baseAnalyticsUserSegmentSchema
  .omit({ id: true, userCount: true, lastCalculated: true })
  .extend({
    filters: z.any().refine(val => {
      // Ensure filters is an array of valid filter objects
      return Array.isArray(val) && val.every(filter => 
        typeof filter === 'object' && 
        filter.field && 
        filter.operator && 
        filter.value !== undefined
      );
    }, {
      message: "Filters must be an array of objects with field, operator, and value properties",
    }),
  });

// Export the messaging schemas with validation
export const insertMessageSchema = baseMessageSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    subject: z.string().min(1, "Subject is required"),
    content: z.string().min(1, "Message content is required"),
    messageType: z.enum([MessageType.DIRECT, MessageType.BROADCAST]),
  });

export const insertMessageRecipientSchema = baseMessageRecipientSchema
  .omit({ id: true, createdAt: true, updatedAt: true, readAt: true })
  .extend({
    status: z.enum([MessageStatus.UNREAD, MessageStatus.READ, MessageStatus.ARCHIVED]).default(MessageStatus.UNREAD),
    targetRole: z.enum([
      UserRole.GUEST,
      UserRole.REGISTERED,
      UserRole.BADGE_HOLDER,
      UserRole.PAID,
      UserRole.MODERATOR,
      UserRole.ADMIN
    ]).optional(),
  });

export const insertAnalyticsSegmentFilterSchema = baseAnalyticsSegmentFilterSchema
  .omit({ id: true });

export type AnalyticsUserSegment = typeof analyticsUserSegments.$inferSelect;
export type InsertAnalyticsUserSegment = z.infer<typeof insertAnalyticsUserSegmentSchema>;

export type AnalyticsSegmentFilter = typeof analyticsSegmentFilters.$inferSelect;
export type InsertAnalyticsSegmentFilter = z.infer<typeof insertAnalyticsSegmentFilterSchema>;

// Migration Records Table is defined above around line 389