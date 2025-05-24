import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface UserAvatarProps {
  user: {
    username: string;
    avatarUrl?: string | null;
    isResident?: boolean;
    role?: string;
    hasMembershipBadge?: boolean;
    subscriptionStatus?: string;
    createdAt?: string | Date;
    // Add other badge-related properties here
  };
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  inComments?: boolean; // Special flag for comments section
  inNavbar?: boolean; // Special flag for navbar display
  className?: string; // Additional CSS classes
  unreadMessages?: number; // Number of unread messages (for notification indicators)
}

export function UserAvatar({ 
  user, 
  size = "md", 
  showBadge = true,
  inComments = false,
  inNavbar = false,
  className = "",
  unreadMessages = 0
}: UserAvatarProps) {
  // Check if user is a 2025 founder (registration year is 2025)
  const isFounder = user.createdAt && new Date(user.createdAt).getFullYear() === 2025;
  
  // Badge visibility conditions
  const shouldShowResidentBadge = showBadge && user.isResident === true;
  const shouldShowMembershipBadge = showBadge && (user.subscriptionStatus === "paid" || user.hasMembershipBadge === true);
  const shouldShowAdminBadge = showBadge && user.role === "admin";
  const shouldShowFounderBadge = showBadge && isFounder;
  
  // Size mappings for avatar
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12"
  };
  
  // Badge size adjustments - using pixels for more consistent positioning
  const badgeSizeClasses = {
    sm: "h-4 w-4 text-[8px]",
    md: "h-5 w-5 text-[9px]",
    lg: "h-6 w-6 text-[10px]"
  };
  
  // Badge sizes for comments - larger to ensure visibility
  const commentsBadgeSizeClasses = {
    sm: "h-4 w-4 text-[8px]",
    md: "h-4 w-4 text-[8px]",
    lg: "h-5 w-5 text-[9px]"
  };

  // Badge position styles based on size and context
  // Multiple badges need different positions
  const badgePositionStyles = {
    // Resident badge (bottom right)
    resident: {
      default: {
        sm: { bottom: '0', right: '0', transform: 'translate(25%, 25%)' },
        md: { bottom: '0', right: '0', transform: 'translate(25%, 25%)' },
        lg: { bottom: '0', right: '0', transform: 'translate(25%, 25%)' }
      },
      comments: {
        sm: { bottom: '0', right: '0', transform: 'translate(25%, 25%)' },
        md: { bottom: '0', right: '0', transform: 'translate(25%, 25%)' },
        lg: { bottom: '0', right: '0', transform: 'translate(25%, 25%)' }
      },
      navbar: {
        sm: { bottom: '0', right: '0', transform: 'translate(30%, 30%)' },
        md: { bottom: '0', right: '0', transform: 'translate(30%, 30%)' },
        lg: { bottom: '0', right: '0', transform: 'translate(30%, 30%)' }
      }
    },
    // Membership badge (top right)
    membership: {
      default: {
        sm: { top: '0', right: '0', transform: 'translate(25%, -25%)' },
        md: { top: '0', right: '0', transform: 'translate(25%, -25%)' },
        lg: { top: '0', right: '0', transform: 'translate(25%, -25%)' }
      },
      comments: {
        sm: { top: '0', right: '0', transform: 'translate(25%, -25%)' },
        md: { top: '0', right: '0', transform: 'translate(25%, -25%)' },
        lg: { top: '0', right: '0', transform: 'translate(25%, -25%)' }
      },
      navbar: {
        sm: { top: '0', right: '0', transform: 'translate(30%, -30%)' },
        md: { top: '0', right: '0', transform: 'translate(30%, -30%)' },
        lg: { top: '0', right: '0', transform: 'translate(30%, -30%)' }
      }
    },
    // Admin badge (bottom left)
    admin: {
      default: {
        sm: { bottom: '0', left: '0', transform: 'translate(-25%, 25%)' },
        md: { bottom: '0', left: '0', transform: 'translate(-25%, 25%)' },
        lg: { bottom: '0', left: '0', transform: 'translate(-25%, 25%)' }
      },
      comments: {
        sm: { bottom: '0', left: '0', transform: 'translate(-25%, 25%)' },
        md: { bottom: '0', left: '0', transform: 'translate(-25%, 25%)' },
        lg: { bottom: '0', left: '0', transform: 'translate(-25%, 25%)' }
      },
      navbar: {
        sm: { bottom: '0', left: '0', transform: 'translate(-30%, 30%)' },
        md: { bottom: '0', left: '0', transform: 'translate(-30%, 30%)' },
        lg: { bottom: '0', left: '0', transform: 'translate(-30%, 30%)' }
      }
    },
    // Founder badge (top left)
    founder: {
      default: {
        sm: { top: '0', left: '0', transform: 'translate(-25%, -25%)' },
        md: { top: '0', left: '0', transform: 'translate(-25%, -25%)' },
        lg: { top: '0', left: '0', transform: 'translate(-25%, -25%)' }
      },
      comments: {
        sm: { top: '0', left: '0', transform: 'translate(-25%, -25%)' },
        md: { top: '0', left: '0', transform: 'translate(-25%, -25%)' },
        lg: { top: '0', left: '0', transform: 'translate(-25%, -25%)' }
      },
      navbar: {
        sm: { top: '0', left: '0', transform: 'translate(-30%, -30%)' },
        md: { top: '0', left: '0', transform: 'translate(-30%, -30%)' },
        lg: { top: '0', left: '0', transform: 'translate(-30%, -30%)' }
      }
    }
  };

  // Get the proper size classes
  const avatarSizeClass = sizeClasses[size];
  const badgeSizeClass = inComments ? commentsBadgeSizeClasses[size] : badgeSizeClasses[size];
  
  // Determine badge positions based on context
  const getPositionForBadgeType = (badgeType: 'resident' | 'membership' | 'admin' | 'founder') => {
    if (inComments) {
      return badgePositionStyles[badgeType].comments[size];
    } else if (inNavbar) {
      return badgePositionStyles[badgeType].navbar[size];
    } else {
      return badgePositionStyles[badgeType].default[size];
    }
  };
  
  // Common badge style base
  const baseBadgeClass = `absolute ${badgeSizeClass} rounded-full 
    font-bold ${inComments ? 'border-[3px]' : 'border-2'} border-white flex items-center justify-center z-50 
    ${inComments ? 'shadow-md' : 'shadow-sm'} transition-all duration-200 hover:scale-110 hover:brightness-110 
    backdrop-blur-sm cursor-help`;
  
  // Define unread message notification styles
  const hasUnreadMessages = unreadMessages > 0;
  
  // Create pulsing red border animation for unread messages - much more prominent now
  const unreadBorderClass = hasUnreadMessages 
    ? "before:absolute before:inset-[-3px] before:rounded-full before:border-[3px] before:border-red-600 before:animate-pulse before:z-10 before:shadow-[0_0_10px_4px_rgba(239,68,68,0.9)]" 
    : "";
  
  return (
    <div className={`relative inline-block ${className} ${unreadBorderClass}`}>
      <Avatar className={avatarSizeClass}>
        <AvatarImage 
          src={user.avatarUrl ?? undefined} 
          alt={user.username}
          className="object-cover"
        />
        <AvatarFallback>
          {user.username?.[0]?.toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
      
      {/* Removed the unread messages badge number from avatar, keeping only the pulsing border */}
      
      {/* Resident badge - bottom right */}
      {shouldShowResidentBadge && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={`${baseBadgeClass} bg-gradient-to-br from-teal-400 to-blue-700 text-white drop-shadow-md`}
                style={getPositionForBadgeType('resident')}
              >
                🌴
              </div>
            </TooltipTrigger>
            <TooltipContent className="w-auto max-w-xs p-0 bg-white shadow-lg rounded-lg overflow-hidden">
              <div className="p-3">
                <div className="text-center mb-2">
                  <div className="text-3xl mb-1">🌴</div>
                  <h3 className="font-bold text-base">Barefoot Bay Resident</h3>
                </div>
                <div className="text-sm text-gray-700 pt-1 border-t">
                  <p>Verified resident of Barefoot Bay community.</p>
                  <p className="mt-1 text-xs text-blue-600">Access to resident-only amenities and events.</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {/* Membership badge (diamond) - top right */}
      {shouldShowMembershipBadge && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={`${baseBadgeClass} bg-gradient-to-br from-yellow-300 to-amber-500 text-white drop-shadow-md`}
                style={getPositionForBadgeType('membership')}
              >
                💎
              </div>
            </TooltipTrigger>
            <TooltipContent className="w-auto max-w-xs p-0 bg-white shadow-lg rounded-lg overflow-hidden">
              <div className="p-3">
                <div className="text-center mb-2">
                  <div className="text-3xl mb-1">💎</div>
                  <h3 className="font-bold text-base">Paid Membership</h3>
                </div>
                <div className="text-sm text-gray-700 pt-1 border-t">
                  <p>Verified premium member with active subscription.</p>
                  <p className="mt-1 text-xs text-amber-600">Benefits include premium content and exclusive features.</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {/* Admin badge (shield) - bottom left */}
      {shouldShowAdminBadge && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={`${baseBadgeClass} bg-gradient-to-br from-blue-700 to-blue-900 text-white drop-shadow-md`}
                style={getPositionForBadgeType('admin')}
              >
                🛡️
              </div>
            </TooltipTrigger>
            <TooltipContent className="w-auto max-w-xs p-0 bg-white shadow-lg rounded-lg overflow-hidden">
              <div className="p-3">
                <div className="text-center mb-2">
                  <div className="text-3xl mb-1">🛡️</div>
                  <h3 className="font-bold text-base">Administrator</h3>
                </div>
                <div className="text-sm text-gray-700 pt-1 border-t">
                  <p>Community administrator with moderation rights.</p>
                  <p className="mt-1 text-xs text-blue-600">Maintains community standards and provides assistance.</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {/* Founder badge (medal) - top left */}
      {shouldShowFounderBadge && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={`${baseBadgeClass} bg-gradient-to-br from-yellow-500 to-yellow-700 text-white drop-shadow-md`}
                style={getPositionForBadgeType('founder')}
              >
                🎖️
              </div>
            </TooltipTrigger>
            <TooltipContent className="w-auto max-w-xs p-0 bg-white shadow-lg rounded-lg overflow-hidden">
              <div className="p-3">
                <div className="text-center mb-2">
                  <div className="text-3xl mb-1">🎖️</div>
                  <h3 className="font-bold text-base">Founder Member</h3>
                </div>
                <div className="text-sm text-gray-700 pt-1 border-t">
                  <p>Original founding member from 2025.</p>
                  <p className="mt-1 text-xs text-amber-600">Helped establish our community from the beginning.</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}