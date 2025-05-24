import { UserRole } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useFlags } from "@/hooks/use-flags";

export function usePermissions() {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFlags();
  
  // Define permission roles based on our expanded role system
  const isAdmin = user?.role === UserRole.ADMIN;
  const isModerator = user?.role === UserRole.MODERATOR || isAdmin;
  const isPaidUser = user?.role === UserRole.PAID || isModerator;
  const isBadgeHolder = user?.role === UserRole.BADGE_HOLDER || isPaidUser;
  const isRegistered = user?.role === UserRole.REGISTERED || isBadgeHolder;
  const isGuest = !user || user.role === UserRole.GUEST;
  
  // SIMPLIFIED PERMISSION SYSTEM: Only check if the user is blocked
  // isApproved has been completely removed from the system
  const isBlocked = user?.isBlocked === true;
  
  // An admin or moderator automatically has permission and can't be blocked
  // For all others, they just need to not be blocked
  const hasPermission = isModerator || !isBlocked;
  
  // Debug the user role and block status
  if (user) {
    console.log("DEBUG usePermissions - Current user role:", user.role, "isAdmin:", isAdmin, 
                "isBlocked:", isBlocked, "hasPermission:", hasPermission);
  }
  
  // Get permissions from feature flags - only need to check role and block status
  const canComment = isFeatureEnabled("comments") && hasPermission;
  const canReact = isFeatureEnabled("reactions") && hasPermission;
  const canPostCalendarEvent = isFeatureEnabled("calendar_post") && hasPermission;
  const canPostForumTopic = isFeatureEnabled("forum_post") && hasPermission;
  const canPostForSaleListing = isFeatureEnabled("for_sale_post") && hasPermission;
  const canCreateVendorPage = isFeatureEnabled("vendor_page") && hasPermission;
  const canAccessAdmin = isFeatureEnabled("admin_access") && hasPermission;
  const canAccessAdminForum = isFeatureEnabled("admin_forum") && hasPermission;
  const canCreateFeaturedContent = isFeatureEnabled("featured_content") && hasPermission;
  
  // Special handling for weather and rocket icons - admins should always see them
  // For other roles, respect the feature flag
  const canSeeWeatherRocketIcons = isAdmin ? true : (isFeatureEnabled("weather_rocket_icons") && hasPermission);
  
  return {
    // CONTENT CREATION PERMISSIONS - NOW LINKED TO FEATURE FLAGS
    
    // Calendar permissions
    canCreateEvent: canPostCalendarEvent,
    canInteractWithEvent: canReact,
    canCommentOnEvent: canComment,
    
    // For sale permissions
    canCreateListing: canPostForSaleListing,
    
    // Forum permissions
    canCreateTopic: canPostForumTopic,
    canCommentOnTopic: canComment,
    canReactToPost: canReact,
    
    // Vendor permissions
    canCreateVendorPage: canCreateVendorPage,
    
    // MODERATION PERMISSIONS
    
    // Moderator+ can block users and delete inappropriate content
    canBlockUsers: isModerator,
    canDeleteContent: isModerator,
    
    // ADMIN PRIVILEGES
    
    // Only admins with admin_access permission can manage users/site settings
    canManageUsers: canAccessAdmin,
    canAccessAnalytics: canAccessAdmin,
    canBulkUpload: canAccessAdmin,
    canApproveUsers: canAccessAdmin,
    canManageSiteSettings: canAccessAdmin,
    
    // Status flags for role checks
    isAdmin,
    isModerator,
    isPaidUser,
    isBadgeHolder,
    isRegistered,
    isGuest,
    
    // Account status flags
    isBlocked,
    hasPermission, // The standard way to check permissions
    
    // Feature flags for permissions
    canComment,
    canReact,
    canPostCalendarEvent,
    canPostForumTopic,
    canPostForSaleListing,
    canAccessAdmin,
    canAccessAdminForum,
    canCreateFeaturedContent,
    canSeeWeatherRocketIcons,
  };
}
