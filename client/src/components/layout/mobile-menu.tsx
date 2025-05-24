import React, { useState } from "react";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useFlags } from "@/hooks/use-flags";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  communityCategories?: any[];
  isAdmin?: boolean;
}

export function MobileMenu({ isOpen, onClose, communityCategories, isAdmin }: MobileMenuProps) {
  const { user, logoutMutation } = useAuth();
  const { isAdmin: hasAdminPermission } = usePermissions();
  const { 
    isCalendarEnabled, 
    isForumEnabled, 
    isForSaleEnabled, 
    isStoreEnabled, 
    isVendorsEnabled, 
    isCommunityEnabled 
  } = useFlags();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  
  // Fetch vendor categories directly from the API
  const { data: vendorCategories } = useQuery({
    queryKey: ['/api/vendor-categories'],
    staleTime: 1000 * 60, // 1 minute - shorter stale time to stay more up-to-date with changes
    select: (data: any) => {
      if (!Array.isArray(data)) {
        console.error("Expected vendor categories data to be an array, but got:", typeof data);
        return [];
      }
      return data;
    },
  });
  
  // Fetch community pages to use in the menu
  const { data: communityPages } = useQuery({
    queryKey: ['/api/pages'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (data: any) => {
      if (!Array.isArray(data)) {
        console.error("Expected pages data to be an array, but got:", typeof data);
        return [];
      }
      return data;
    },
  });

  // Helper function to get pages with a specific category prefix
  // Helper function to get pages for a category
  // Now uses the database 'category' field first, then falls back to slug checking
  const getPagesForCategory = (prefix: string) => {
    if (!communityPages || !Array.isArray(communityPages)) return [];
    
    // Map between category slugs in community_categories and actual category values in page_contents
    const categoryMapping: {[key: string]: string} = {
      'local-services': 'services',
      'government-regulations': 'government',
      'community-information': 'community',
      'nature-environment': 'nature',
      'transportation-accessibility': 'transportation',
      'religion-community': 'religion',
      'safety-emergency-service': 'safety'
    };
    
    // Get the simple category name from either the mapping or the original prefix
    const targetCategory = categoryMapping[prefix] || prefix;
    
    // Filter based on the explicit category field in the database
    return communityPages.filter(page => {
      // For safety pages, we use completely hardcoded links, so exclude them 
      if ((page.category === 'safety' || page.id === 17 || page.id === 18 || page.id === 19) && 
          prefix !== 'safety-emergency-service' && prefix !== 'safety') {
        return false;
      }
      
      // For other categories, use the category field we populated in the database
      if (page.category) {
        return page.category === targetCategory;
      }
      
      // Fallback to the old slug-based filtering if category isn't populated
      return page.slug && (
        page.slug.startsWith(`${targetCategory}-`) || 
        page.slug.startsWith(`${prefix}-`)
      );
    });
  };
  
  // Special standalone function to render ONLY the 3 safety items for mobile menu
  const renderSafetyItemsMobile = (onCloseMenu: () => void) => {
    return (
      <div className="pl-2 space-y-2" id="mobile-safety-menu-items">
        <Link href="/community/safety/contacts" onClick={onCloseMenu}>
          <div className="py-1 text-navy hover:text-coral">
            Important Contacts (Sheriff, Fire, Medical)
          </div>
        </Link>
        <Link href="/community/safety/pet-rules" onClick={onCloseMenu}>
          <div className="py-1 text-navy hover:text-coral">
            Pet Rules/Safety
          </div>
        </Link>
        <Link href="/community/safety/crime" onClick={onCloseMenu}>
          <div className="py-1 text-navy hover:text-coral">
            Crimes & Reports
          </div>
        </Link>
      </div>
    );
  };
  
  const toggleMenu = (menuName: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuName]: !prev[menuName]
    }));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Mobile menu panel */}
      <div className="relative w-4/5 max-w-sm bg-white h-full overflow-y-auto p-6 shadow-lg transform transition-transform duration-300">
        {/* Header with close button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-navy">Menu</h2>
          <button className="p-1 rounded-full hover:bg-gray-100" onClick={onClose}>
            <X size={24} className="text-navy" />
          </button>
        </div>
        
        {/* User section (if logged in) */}
        {user && (
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex flex-col">
              <div className="font-medium text-navy text-xl mb-1">{user.fullName || user.username}</div>
              {user.email && <div className="text-sm text-gray-500">{user.email}</div>}
            </div>
            
            <div className="mt-4 space-y-2">
              <Link href="/profile" onClick={onClose}>
                <div className="py-2 text-navy hover:text-coral">Profile</div>
              </Link>
              
              <Link href="/messages" onClick={onClose}>
                <div className="py-2 text-navy hover:text-coral">Messages</div>
              </Link>
              
              <Link href="/subscriptions" onClick={onClose}>
                <div className="py-2 text-navy hover:text-coral">Sponsorship</div>
              </Link>
              
              <Link href="/contact-us" onClick={onClose}>
                <div className="py-2 text-navy hover:text-coral">Contact Us</div>
              </Link>
              
              {isAdmin && (
                <Link href="/admin" onClick={onClose}>
                  <div className="py-2 text-navy hover:text-coral">Admin Dashboard</div>
                </Link>
              )}
              
              <button 
                onClick={() => {
                  logoutMutation.mutate();
                  onClose();
                }}
                className="w-full text-left py-2 text-red-500 hover:text-red-700"
              >
                Log Out
              </button>
            </div>
          </div>
        )}
        
        {/* Navigation links */}
        <div className="space-y-4">
          {/* Main navigation */}
          <Link href="/" onClick={onClose}>
            <div className="py-2 text-navy hover:text-coral font-medium">Home</div>
          </Link>
          
          {/* Calendar */}
          {isCalendarEnabled() && (
            <Link href="/calendar" onClick={onClose}>
              <div className="py-2 text-navy hover:text-coral font-medium">Calendar</div>
            </Link>
          )}
          
          {/* Forum */}
          {isForumEnabled() && (
            <Link href="/forum" onClick={onClose}>
              <div className="py-2 text-navy hover:text-coral font-medium">Forum</div>
            </Link>
          )}
          
          {/* Store dropdown */}
          {isStoreEnabled() && (
            <div className="space-y-2">
              <div 
                className="py-2 text-navy hover:text-coral font-medium cursor-pointer flex items-center justify-between"
                onClick={() => toggleMenu('store')}
              >
                <span>Store</span>
                {expandedMenus['store'] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
              
              {expandedMenus['store'] && (
                <div className="py-2 px-4 space-y-3 bg-gray-50 rounded-md mt-1">
                  <Link href="/store" onClick={onClose}>
                    <div className="py-1 text-navy hover:text-coral">Browse Products</div>
                  </Link>
                  <Link href="/store/track-order" onClick={onClose}>
                    <div className="py-1 text-navy hover:text-coral">Track Your Order</div>
                  </Link>
                  {user && (
                    <Link href="/store/my-returns" onClick={onClose}>
                      <div className="py-1 text-navy hover:text-coral">My Returns</div>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* For Sale dropdown */}
          {isForSaleEnabled() && (
            <div className="space-y-2">
              <div 
                className="py-2 text-navy hover:text-coral font-medium cursor-pointer flex items-center justify-between"
                onClick={() => toggleMenu('forSale')}
              >
                <span>For Sale</span>
                {expandedMenus['forSale'] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
              
              {expandedMenus['forSale'] && (
                <div className="py-2 px-4 space-y-3 bg-gray-50 rounded-md mt-1">
                  <Link href="/for-sale" onClick={onClose}>
                    <div className="py-1 text-navy hover:text-coral">All Listings</div>
                  </Link>
                  {user && (
                    <Link href="/for-sale?filter=my-listings" onClick={onClose}>
                      <div className="py-1 text-navy hover:text-coral">My Listings</div>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Vendors dropdown */}
          {isVendorsEnabled() && (
            <div className="space-y-2">
              <div 
                className="py-2 text-navy hover:text-coral font-medium cursor-pointer flex items-center justify-between"
                onClick={() => toggleMenu('vendors')}
              >
                <span>Vendors</span>
                {expandedMenus['vendors'] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
              
              {expandedMenus['vendors'] && (
                <div className="py-2 px-4 space-y-3 bg-gray-50 rounded-md mt-1">
                  <Link href="/vendors" onClick={onClose}>
                    <div className="py-1 text-navy hover:text-coral">All Preferred Vendors</div>
                  </Link>
                  
                  {vendorCategories && Array.isArray(vendorCategories) && vendorCategories.length > 0 ? (
                    vendorCategories
                      .filter(category => !category.isHidden)
                      .sort((a, b) => a.order - b.order)
                      .map((category) => (
                        <Link key={category.id} href={`/vendors/${category.slug}`} onClick={onClose}>
                          <div className="py-1 text-navy hover:text-coral">{category.name}</div>
                        </Link>
                      ))
                  ) : (
                    <>
                      <Link href="/vendors/home-service" onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">Home Service</div>
                      </Link>
                      <Link href="/vendors/landscaping" onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">Landscaping</div>
                      </Link>
                      <Link href="/vendors/professional-services" onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">Professional Services</div>
                      </Link>
                    </>
                  )}
                  
                  {isAdmin && (
                    <Link href="/admin/manage-vendors" onClick={onClose}>
                      <div className="py-1 text-navy hover:text-coral font-medium">Manage Vendors</div>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Community dropdown */}
          {isCommunityEnabled() && (
            <div className="space-y-2">
              <div 
                className="py-2 text-navy hover:text-coral font-medium cursor-pointer flex items-center justify-between"
                onClick={() => toggleMenu('community')}
              >
                <span>Community</span>
                {expandedMenus['community'] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
              
              {expandedMenus['community'] && (
                <div className="py-2 px-4 space-y-3 bg-gray-50 rounded-md mt-1 mb-2 max-h-[40vh] overflow-y-auto">
                  <div className="font-bold py-2">Government & Regulation</div>
                  <div className="pl-2 space-y-2">
                    {/* Render all government pages dynamically from the database and sort by order */}
                    {getPagesForCategory('government-regulations')
                      .sort((a, b) => {
                        // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                        const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                        const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                        return orderA - orderB;
                      })
                      .map((page) => (
                        <Link key={page.id} href={`/community/government/${page.slug.replace('government-', '')}`} onClick={onClose}>
                          <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                        </Link>
                      ))
                    }
                  </div>
                
                {/* Safety & Emergency Services section - now using dynamic content */}
                <div className="font-bold py-2 mt-3 border-t border-gray-200 pt-3">Safety & Emergency Services</div>
                <div className="pl-2 space-y-2">
                  {/* Get safety-related pages from database and respect their order */}
                  {getPagesForCategory('safety-emergency-service')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/safety/${page.slug.replace('safety-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                  
                  {/* If no safety pages were found in the database, fall back to hardcoded links */}
                  {getPagesForCategory('safety-emergency-service').length === 0 && (
                    <>
                      <Link href="/community/safety/contacts" onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">
                          Important Contacts (Sheriff, Fire, Medical)
                        </div>
                      </Link>
                      <Link href="/community/safety/pet-rules" onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">
                          Pet Rules/Safety
                        </div>
                      </Link>
                      <Link href="/community/safety/crime" onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">
                          Crimes & Reports
                        </div>
                      </Link>
                    </>
                  )}
                </div>
                
                <div className="font-bold py-2">Community Information</div>
                <div className="pl-2 space-y-2">
                  {/* Render all community information pages dynamically and sort by order */}
                  {getPagesForCategory('community-information')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/community/${page.slug.replace('community-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                </div>
                
                <div className="font-bold py-2">Local Services & Resources</div>
                <div className="pl-2 space-y-2">
                  {/* Render all local services pages dynamically and sort by order */}
                  {getPagesForCategory('local-services')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/services/${page.slug.replace('services-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                </div>
                
                <div className="font-bold py-2">Nature & Environment</div>
                <div className="pl-2 space-y-2">
                  {/* Render all nature pages dynamically and sort by order */}
                  {getPagesForCategory('nature-environment')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/nature/${page.slug.replace('nature-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                  
                  {/* Also render amenities pages */}
                  {getPagesForCategory('amenities')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/amenities/${page.slug.replace('amenities-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                </div>
                
                <div className="font-bold py-2">Transportation & Accessibility</div>
                <div className="pl-2 space-y-2">
                  {/* Render all transportation pages dynamically and sort by order */}
                  {getPagesForCategory('transportation-accessibility')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/transportation/${page.slug.replace('transportation-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                </div>
                
                <div className="font-bold py-2">Religion & Community Engagement</div>
                <div className="pl-2 space-y-2">
                  {/* Render all religion pages dynamically and sort by order */}
                  {getPagesForCategory('religion-community')
                    .sort((a, b) => {
                      // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                      const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                      const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                      return orderA - orderB;
                    })
                    .map((page) => (
                      <Link key={page.id} href={`/community/religion/${page.slug.replace('religion-', '')}`} onClick={onClose}>
                        <div className="py-1 text-navy hover:text-coral">{page.title}</div>
                      </Link>
                    ))
                  }
                </div>
                
                {isAdmin && (
                  <Link href="/admin/manage-pages" onClick={onClose}>
                    <div className="py-1 text-navy hover:text-coral font-medium mt-2">Manage Pages</div>
                  </Link>
                )}
              </div>
            )}
            </div>
          )}
          
          {/* Login/Register for guest users */}
          {!user && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="mb-6">
                <Link href="/auth" onClick={onClose} className="block w-full">
                  <Button variant="outline" className="w-full justify-center py-6 text-lg">
                    Log In
                  </Button>
                </Link>
              </div>
              <div>
                <Link href="/auth?tab=register" onClick={onClose} className="block w-full">
                  <Button className="w-full justify-center py-6 text-lg">
                    Sign Up
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}