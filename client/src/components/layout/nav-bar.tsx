import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Settings,
  Users,
  Shield,
  ShoppingBag,
  Package,
  MoreHorizontal,
  Building,
  AlertTriangle,
  CreditCard,
  Info,
  Store,
  Leaf,
  Car,
  Heart,
  RotateCcw,
  RefreshCcw,
  Home,
  User,
  Briefcase,
  ThermometerSun,
  MessageSquare,
  Menu,
  Star,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useFlags } from "@/hooks/use-flags";
import { UserAvatar } from "@/components/shared/user-avatar";
import { WeatherWidget } from "@/components/shared/weather-widget";
import { RocketLaunchViewer } from "@/components/shared/rocket-launch-viewer";
import { MobileMenu } from "./mobile-menu";
import { 
  FaHome, FaBriefcase, FaLeaf, FaStore, FaUtensils, FaCar, FaWrench, 
  FaHammer, FaPaintBrush, FaShoppingCart, FaWater, FaSwimmingPool,
  FaFaucet, FaTree, FaTools, FaGlassCheers, FaDog, FaShoppingBag,
  FaUserTie, FaTruck, FaLaptop, FaBuilding, FaWifi, FaStar, FaEnvelope,
  FaPhone, FaKey, FaTv, FaAt, FaBook, FaClinicMedical, FaPaw,
  FaGraduationCap, FaImage, FaCamera, FaLandmark, FaCarAlt, FaGlobe, 
  FaBicycle, FaMotorcycle, FaHeart, FaClipboardCheck, 
  
  // Additional icons for community categories
  FaCity, FaClipboardCheck as FaClipboardList, FaBalanceScale, FaBullhorn,
  FaMountain, FaSeedling, FaThermometerHalf, FaUmbrellaBeach,
  FaHospital, FaTooth, FaHouseUser, FaCouch, FaTaxi, FaTrain,
  FaSubway, FaPlane, FaComments, FaHandsHelping, FaVihara, FaRunning,
  FaGolfBall, FaDesktop, FaMobileAlt as FaMobile, FaNetworkWired, 
  FaMicrochip, FaPowerOff, FaAmbulance, FaFireExtinguisher, 
  FaShieldAlt, FaHeartbeat, FaUniversity as FaBank,
  
  // Additional icon sets
  // Recreation & Activities
  FaSwimmer, FaHiking, FaBiking, FaFish, FaCampground, FaDumbbell, 
  FaVolleyballBall, FaTableTennis, FaBasketballBall, FaFootballBall, 
  FaGolfBall as FaGolf, FaBaseballBall, FaChess, FaGuitar, 
  FaGamepad, FaTheaterMasks, FaTicketAlt, FaMusic, FaPuzzlePiece,
  
  // Weather & Seasons
  FaSnowflake, FaCloudRain, FaCloudSunRain, FaWind, FaUmbrella, FaCloud, 
  FaCloudSun, FaCloudMoon, FaSun as FaSunIcon, FaMoon, FaRainbow,
  
  // Food & Dining
  FaCoffee, FaCocktail, FaWineGlass, FaBeer, FaIceCream, FaPizzaSlice, 
  FaHamburger, FaCheese, FaCookie, FaAppleAlt, FaCarrot, FaEgg,
  
  // Communication & Media
  FaNewspaper, FaVideo, FaHeadphones, FaPodcast, FaMicrophone, FaRadio, 
  FaInbox, FaMailBulk, FaPrint, FaRss, FaCommentDots, FaCommentAlt,
  
  // Finance & Business  
  FaCreditCard, FaMoneyBillWave, FaPiggyBank, FaChartLine, FaChartBar, 
  FaPercentage, FaReceipt, FaFileInvoiceDollar, FaHandHoldingUsd, FaStore as FaStorefront,
  
  // Personal & Lifestyle
  FaBed, FaShower, FaSoap, FaToilet, FaToothbrush, FaBath, FaHotTub, 
  FaUmbrellaBeach as FaBeach, FaSpa, FaMasksTheater, FaGem, FaGift, 
  FaTshirt, FaSocks, FaShirt, FaGlasses,
  
  // Time & Scheduling  
  FaClock, FaRegClock, FaCalendarAlt, FaCalendarDay, FaCalendarWeek, 
  FaHourglassHalf, FaStopwatch, FaBell, FaRegBell,
  
  // Direction & Location
  FaMapMarkedAlt, FaMap, FaCompass, FaDirections, FaLocationArrow, 
  FaSearchLocation, FaRoute, FaMapSigns, FaStreetView
} from "react-icons/fa";

export function NavBar() {
  const { user, logoutMutation } = useAuth();
  const { isAdmin } = usePermissions();
  const { 
    isCalendarEnabled, 
    isForumEnabled, 
    isForSaleEnabled, 
    isStoreEnabled, 
    isVendorsEnabled, 
    isCommunityEnabled 
  } = useFlags();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Fetch unread message count for notifications
  const { data: unreadMessagesData } = useQuery({
    queryKey: ['/api/messages/unread/count'],
    enabled: !!user,
    refetchInterval: 15000, // Refresh more frequently (every 15 seconds)
    staleTime: 5000, // Consider data fresh for only 5 seconds
    refetchOnWindowFocus: true, // Refresh when window regains focus
    retry: 2, // Retry failed requests up to 2 times
    onError: (error) => {
      console.error('Error fetching unread message count:', error);
    }
  });
  
  // Get the unread message count from the data, with fallback to ensure it's a number
  const unreadMessagesCount = unreadMessagesData?.count !== undefined ? unreadMessagesData.count : 0;
  
  // Debug log for troubleshooting notification issues
  console.log('Unread messages count:', unreadMessagesCount);
  
  // Fetch vendor categories from the database (filtered to non-hidden ones)
  const { data: vendorCategories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['/api/vendor-categories'],
    staleTime: 1000 * 60, // 1 minute - reduced stale time to stay more responsive to admin changes
    select: (data: any) => {
      // Check if data is an array before using it
      if (!Array.isArray(data)) {
        console.error("Expected vendor categories data to be an array, but got:", typeof data);
        return [];
      }
      return data;
    },
  });
  
  // Fetch community pages to use in the dropdown menu
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

  // Fetch community categories from the database to display in the administrator defined order
  const { data: communityCategories } = useQuery({
    queryKey: ['/api/community-categories'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (data: any) => {
      if (!Array.isArray(data)) {
        console.error("Expected community categories data to be an array, but got:", typeof data);
        return [];
      }
      // The backend already sorts by the order field, but we can ensure it here too
      return data.sort((a, b) => a.order - b.order);
    },
  });

  // Helper function to get pages with a specific category
  // Now uses the database 'category' field first, then falls back to slug checking
  const getPagesForCategory = (categorySlugOrSlugs: string | string[]) => {
    // Ensure communityPages is an array before using filter
    if (!communityPages) return [];
    
    // Extra safety - convert to array if it's not already
    const pagesArray = Array.isArray(communityPages) 
      ? communityPages 
      : (communityPages && typeof communityPages === 'object' && communityPages.data && Array.isArray(communityPages.data))
        ? communityPages.data
        : [];
    
    if (pagesArray.length === 0) return [];
    
    // Convert the input to a single category or an array of categories
    const targetCategories = Array.isArray(categorySlugOrSlugs) 
      ? categorySlugOrSlugs 
      : [categorySlugOrSlugs];
      
    // Map between category slugs in community_categories and actual category values in page_contents
    const categoryMapping: {[key: string]: string[]} = {
      'local-services': ['services'],
      'government-regulations': ['government'],
      'community-information': ['community'],
      'nature-environment': ['nature'],
      'transportation-accessibility': ['transportation'],
      'religion-community': ['religion'],
      'safety-emergency-service': ['safety']
    };
    
    // Create an expanded list of categories to look for
    const expandedCategories = targetCategories.flatMap(cat => {
      // If this is a category slug from community_categories, map to corresponding page category
      if (categoryMapping[cat]) {
        return categoryMapping[cat];
      }
      // Otherwise keep the original category (this handles direct category values)
      return cat;
    });
    
    // First filter based on the explicit category field in the database
    return pagesArray.filter(page => {
      if (!page) return false;
      
      // For safety pages, we use completely hardcoded links, so exclude them 
      if ((page.category === 'safety' || page.id === 17 || page.id === 18 || page.id === 19) && 
          !targetCategories.includes('safety-emergency-service')) {
        return false;
      }
      
      // For other categories, use the category field we populated in the database
      if (page.category) {
        return expandedCategories.includes(page.category);
      }
      
      // Fallback to the old slug-based filtering if category isn't populated
      return page.slug && expandedCategories.some(cat => page.slug.startsWith(`${cat}-`));
    });
  };
  
  // Special function to render ONLY the 3 hardcoded safety items (no dynamic content)
  // This is a completely standalone function that doesn't use the general page list
  const getSafetyCategory = () => {
    if (!communityCategories) return null;
    
    // Extra safety - convert to array if it's not already
    const categoriesArray = Array.isArray(communityCategories) 
      ? communityCategories 
      : (communityCategories && typeof communityCategories === 'object' && communityCategories.data && Array.isArray(communityCategories.data))
        ? communityCategories.data
        : [];
    
    if (categoriesArray.length === 0) return null;
    
    // Use a more flexible approach that matches based on partial slug or name
    return categoriesArray.find(cat => 
      // Check for any slug that contains both "safety" and "emergency" keywords
      (cat && cat.slug && cat.slug.includes('safety') && cat.slug.includes('emergency')) ||
      // Or check for a name containing "Safety & Emergency"
      (cat && cat.name && cat.name.includes('Safety & Emergency'))
    );
  };

  return (
    <div className="nav-container">
      <nav className="bg-white bg-opacity-0 z-50">
        <div className="container mx-auto px-4 xl:px-8 h-20 xl:h-32 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/">
              <div className="flex items-center cursor-pointer">
                <img 
                  src="/assets/DiscoverBFBText.png" 
                  alt="Discover Barefoot Bay"
                  className="h-16 xl:h-24 w-auto"
                />
              </div>
            </Link>
            <div className="ml-4 flex items-center">
              <WeatherWidget />
              <RocketLaunchViewer />
            </div>
          </div>

          {/* Mobile menu button */}
          <button 
            className="xl:hidden p-2 text-navy focus:outline-none"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={28} />
          </button>

          {/* Desktop menu */}
          <div className="hidden xl:flex items-center gap-8 2xl:gap-12">
            {/* Calendar navigation item */}
            {isCalendarEnabled() && (
              <Link href="/calendar">
                <span className="text-navy hover:text-coral transition-colors font-advent-pro text-2xl px-4 py-2 cursor-pointer" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                  Calendar
                </span>
              </Link>
            )}
            
            {/* Forum navigation item */}
            {isForumEnabled() && (
              <Link href="/forum">
                <span className="text-navy hover:text-coral transition-colors font-advent-pro text-2xl px-4 py-2 cursor-pointer" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                  Forum
                </span>
              </Link>
            )}
            
            {/* For Sale navigation item */}
            {isForSaleEnabled() && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className="text-navy hover:text-coral transition-colors font-advent-pro text-2xl px-4 py-2 cursor-pointer" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    For Sale
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="dropdown-menu-content w-56 bg-white border border-navy/20 p-4 shadow-lg">
                  <Link href="/for-sale">
                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2">
                      <Home className="mr-2 h-4 w-4" />
                      <span>All Listings</span>
                    </DropdownMenuItem>
                  </Link>
                  {user && (
                    <Link href="/for-sale?filter=my-listings">
                      <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                        <User className="mr-2 h-4 w-4" />
                        <span>My Listings</span>
                      </DropdownMenuItem>
                    </Link>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* Store navigation item */}
            {isStoreEnabled() && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className="text-navy hover:text-coral transition-colors font-advent-pro text-2xl px-4 py-2 cursor-pointer" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    Store
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="dropdown-menu-content w-56 bg-white border border-navy/20 p-4 shadow-lg">
                  <Link href="/store">
                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2">
                      <ShoppingBag className="mr-2 h-4 w-4" />
                      <span>Browse Products</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/store/track-order">
                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                      <Package className="mr-2 h-4 w-4" />
                      <span>Track Your Order</span>
                    </DropdownMenuItem>
                  </Link>
                  {user && (
                    <Link href="/store/my-returns">
                      <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                        <RotateCcw className="mr-2 h-4 w-4" />
                        <span>My Returns</span>
                      </DropdownMenuItem>
                    </Link>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* Vendors navigation item */}
            {isVendorsEnabled() && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className="text-navy hover:text-coral transition-colors font-advent-pro text-2xl px-4 py-2 cursor-pointer" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    Vendors
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="dropdown-menu-content w-56 bg-white border border-navy/20 p-4 shadow-lg">
                  {/* Always show the "All Preferred Vendors" option at the top */}
                  <Link href="/vendors">
                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2">
                      <Star className="mr-2 h-4 w-4" />
                      <span>All Preferred Vendors</span>
                    </DropdownMenuItem>
                  </Link>
                  
                  {/* Show dynamic vendor categories loaded from database */}
                  {vendorCategories && Array.isArray(vendorCategories) && vendorCategories.length > 0 ? (
                    vendorCategories
                      // Filter out hidden categories in the navigation menu
                      .filter(category => !category.isHidden)
                      .sort((a, b) => a.order - b.order) // Sort by order field
                      .map((category) => (
                        <Link key={category.id} href={`/vendors/${category.slug}`}>
                          <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                            {/* Render the dynamic icon from the database if available */}
                            {(() => {
                              // If the category has an icon field, use that
                              if (category.icon) {
                                switch(category.icon) {
                                  case 'home': return <FaHome className="mr-2 h-4 w-4" />;
                                  case 'store': return <FaStore className="mr-2 h-4 w-4" />;
                                  case 'leaf': return <FaLeaf className="mr-2 h-4 w-4" />;
                                  case 'briefcase': return <FaBriefcase className="mr-2 h-4 w-4" />;
                                  case 'food': return <FaUtensils className="mr-2 h-4 w-4" />;
                                  case 'car': return <FaCar className="mr-2 h-4 w-4" />;
                                  case 'wrench': return <FaWrench className="mr-2 h-4 w-4" />;
                                  case 'hammer': return <FaHammer className="mr-2 h-4 w-4" />;
                                  case 'paint': return <FaPaintBrush className="mr-2 h-4 w-4" />;
                                  case 'shopping': return <FaShoppingCart className="mr-2 h-4 w-4" />;
                                  case 'water': return <FaWater className="mr-2 h-4 w-4" />;
                                  case 'pool': return <FaSwimmingPool className="mr-2 h-4 w-4" />;
                                  case 'plumbing': return <FaFaucet className="mr-2 h-4 w-4" />;
                                  case 'lawn': return <FaTree className="mr-2 h-4 w-4" />;
                                  case 'tools': return <FaTools className="mr-2 h-4 w-4" />;
                                  case 'entertainment': return <FaGlassCheers className="mr-2 h-4 w-4" />;
                                  case 'pets': return <FaDog className="mr-2 h-4 w-4" />;
                                  case 'retail': return <FaShoppingBag className="mr-2 h-4 w-4" />;
                                  case 'professional': return <FaUserTie className="mr-2 h-4 w-4" />;
                                  case 'delivery': return <FaTruck className="mr-2 h-4 w-4" />;
                                  case 'tech': return <FaLaptop className="mr-2 h-4 w-4" />;
                                  case 'realestate': return <FaBuilding className="mr-2 h-4 w-4" />;
                                  case 'internet': return <FaWifi className="mr-2 h-4 w-4" />;
                                  case 'star': return <FaStar className="mr-2 h-4 w-4" />;
                                  case 'health': return <FaClinicMedical className="mr-2 h-4 w-4" />;
                                  case 'education': return <FaGraduationCap className="mr-2 h-4 w-4" />;
                                  case 'photo': return <FaCamera className="mr-2 h-4 w-4" />;
                                  case 'banking': return <FaLandmark className="mr-2 h-4 w-4" />;
                                  case 'travel': return <FaGlobe className="mr-2 h-4 w-4" />;
                                  default: return <FaStore className="mr-2 h-4 w-4" />;
                                }
                              }
                              
                              // Fallback based on category name for backward compatibility
                              if (category.name.toLowerCase().includes('home')) {
                                return <Home className="mr-2 h-4 w-4" />;
                              } else if (category.name.toLowerCase().includes('landscap')) {
                                return <Leaf className="mr-2 h-4 w-4" />;
                              } else if (category.name.toLowerCase().includes('contract') || 
                                         category.name.toLowerCase().includes('professional')) {
                                return <Briefcase className="mr-2 h-4 w-4" />;
                              } else {
                                return <Store className="mr-2 h-4 w-4" />;
                              }
                            })()}
                            <span>{category.name}</span>
                          </DropdownMenuItem>
                        </Link>
                      ))
                  ) : (
                    <>
                      {/* Fallback for when categories aren't loaded yet */}
                      <Link href="/vendors/home-service">
                        <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                          <Home className="mr-2 h-4 w-4" />
                          <span>Home Service</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/vendors/landscaping">
                        <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                          <Leaf className="mr-2 h-4 w-4" />
                          <span>Landscaping</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/vendors/professional-services">
                        <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                          <Briefcase className="mr-2 h-4 w-4" />
                          <span>Professional Services</span>
                        </DropdownMenuItem>
                      </Link>
                    </>
                  )}
                  
                  {/* Admin-only manage button */}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator className="my-2 border-t border-navy/10" />
                      <Link href="/admin/manage-vendors">
                        <DropdownMenuItem className="text-white bg-coral hover:bg-white hover:text-coral focus:bg-white focus:text-coral border border-transparent hover:border-navy/20 py-2 rounded mt-1 transition-colors">
                          <Settings className="mr-2 h-4 w-4" />
                          <span className="font-medium">Manage</span>
                        </DropdownMenuItem>
                      </Link>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* Community navigation item */}
            {isCommunityEnabled() && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className="text-navy hover:text-coral transition-colors font-advent-pro text-2xl px-4 py-2 cursor-pointer flex items-center" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    Community
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="dropdown-menu-content community-dropdown w-72 bg-white border border-navy/20 p-4 shadow-lg [&_li]:text-navy [&_li]:transition-colors [&_li]:rounded-sm [&_li]:cursor-pointer [&_li]:py-1 [&_.my-2]:border-navy/10 max-h-[70vh] overflow-y-auto overflow-x-hidden">
                
                  {communityCategories && Array.isArray(communityCategories) && communityCategories.length > 0 ? (
                    // Map through the categories sorted by their order field
                    communityCategories.map((category, index) => (
                      <div key={category.id}>
                        {/* Add separator between categories */}
                        {index > 0 && <DropdownMenuSeparator className="my-2 border-t border-navy/10" />}
                        
                        <DropdownMenuGroup>
                          <div className="mb-2">
                            <Link href={`/community/${category.slug.split('-')[0]}`}>
                              <div className="flex items-center cursor-pointer hover:text-coral transition-colors">
                                {/* Render icon based on the icon field in the database */}
                                {category.icon ? (
                                  // If we have an icon field, use it to select the appropriate icon
                                  <div className="mr-2">
                                    {category.icon === 'FaBuilding' && <FaBuilding className="h-4 w-4" />}
                                    {category.icon === 'FaLandmark' && <FaLandmark className="h-4 w-4" />}
                                    {category.icon === 'FaCity' && <FaCity className="h-4 w-4" />}
                                    {category.icon === 'FaBook' && <FaBook className="h-4 w-4" />}
                                    {category.icon === 'FaClipboardCheck' && <FaClipboardCheck className="h-4 w-4" />}
                                    {category.icon === 'FaBalanceScale' && <FaBalanceScale className="h-4 w-4" />}
                                    {category.icon === 'FaBullhorn' && <FaBullhorn className="h-4 w-4" />}
                                    {category.icon === 'FaGlobe' && <FaGlobe className="h-4 w-4" />}
                                    {category.icon === 'FaLeaf' && <FaLeaf className="h-4 w-4" />}
                                    {category.icon === 'FaTree' && <FaTree className="h-4 w-4" />}
                                    {category.icon === 'FaWater' && <FaWater className="h-4 w-4" />}
                                    {category.icon === 'FaMountain' && <FaMountain className="h-4 w-4" />}
                                    {category.icon === 'FaSeedling' && <FaSeedling className="h-4 w-4" />}
                                    {category.icon === 'FaThermometerHalf' && <FaThermometerHalf className="h-4 w-4" />}
                                    {category.icon === 'FaUmbrellaBeach' && <FaUmbrellaBeach className="h-4 w-4" />}
                                    {category.icon === 'FaSun' && <FaStar className="h-4 w-4" />}
                                    {category.icon === 'FaStore' && <FaStore className="h-4 w-4" />}
                                    {category.icon === 'FaUtensils' && <FaUtensils className="h-4 w-4" />}
                                    {category.icon === 'FaShoppingCart' && <FaShoppingCart className="h-4 w-4" />}
                                    {category.icon === 'FaHospital' && <FaHospital className="h-4 w-4" />}
                                    {category.icon === 'FaTooth' && <FaTooth className="h-4 w-4" />}
                                    {category.icon === 'FaClinicMedical' && <FaClinicMedical className="h-4 w-4" />}
                                    {category.icon === 'FaGraduationCap' && <FaGraduationCap className="h-4 w-4" />}
                                    {category.icon === 'FaBank' && <FaBank className="h-4 w-4" />}
                                    {category.icon === 'FaHome' && <FaHome className="h-4 w-4" />}
                                    {category.icon === 'FaHouseUser' && <FaHouseUser className="h-4 w-4" />}
                                    {category.icon === 'FaTools' && <FaTools className="h-4 w-4" />}
                                    {category.icon === 'FaHammer' && <FaHammer className="h-4 w-4" />}
                                    {category.icon === 'FaWrench' && <FaWrench className="h-4 w-4" />}
                                    {category.icon === 'FaPaintBrush' && <FaPaintBrush className="h-4 w-4" />}
                                    {category.icon === 'FaCouch' && <FaCouch className="h-4 w-4" />}
                                    {category.icon === 'FaKey' && <FaKey className="h-4 w-4" />}
                                    {category.icon === 'FaCar' && <FaCar className="h-4 w-4" />}
                                    {category.icon === 'FaCarAlt' && <FaCarAlt className="h-4 w-4" />}
                                    {category.icon === 'FaTruck' && <FaTruck className="h-4 w-4" />}
                                    {category.icon === 'FaTaxi' && <FaTaxi className="h-4 w-4" />}
                                    {category.icon === 'FaBus' && <FaSubway className="h-4 w-4" />}
                                    {category.icon === 'FaTrain' && <FaTrain className="h-4 w-4" />}
                                    {category.icon === 'FaBicycle' && <FaBicycle className="h-4 w-4" />}
                                    {category.icon === 'FaPlane' && <FaPlane className="h-4 w-4" />}
                                    {category.icon === 'FaUsers' && <FaComments className="h-4 w-4" />}
                                    {category.icon === 'FaHeart' && <FaHeart className="h-4 w-4" />}
                                    {category.icon === 'FaHandsHelping' && <FaHandsHelping className="h-4 w-4" />}
                                    {category.icon === 'FaDog' && <FaDog className="h-4 w-4" />}
                                    {category.icon === 'FaPaw' && <FaPaw className="h-4 w-4" />}
                                    {category.icon === 'FaVihara' && <FaVihara className="h-4 w-4" />}
                                    {category.icon === 'FaRunning' && <FaRunning className="h-4 w-4" />}
                                    {category.icon === 'FaFootballBall' && <FaGolfBall className="h-4 w-4" />}
                                    {category.icon === 'FaDesktop' && <FaDesktop className="h-4 w-4" />}
                                    {category.icon === 'FaMobile' && <FaMobile className="h-4 w-4" />}
                                    {category.icon === 'FaWifi' && <FaWifi className="h-4 w-4" />}
                                    {category.icon === 'FaTv' && <FaTv className="h-4 w-4" />}
                                    {category.icon === 'FaLaptop' && <FaLaptop className="h-4 w-4" />}
                                    {category.icon === 'FaNetworkWired' && <FaNetworkWired className="h-4 w-4" />}
                                    {category.icon === 'FaMicrochip' && <FaMicrochip className="h-4 w-4" />}
                                    {category.icon === 'FaPowerOff' && <FaPowerOff className="h-4 w-4" />}
                                    {category.icon === 'FaAmbulance' && <FaAmbulance className="h-4 w-4" />}
                                    {category.icon === 'FaFireExtinguisher' && <FaFireExtinguisher className="h-4 w-4" />}
                                    {category.icon === 'FaShieldAlt' && <FaShieldAlt className="h-4 w-4" />}
                                    {category.icon === 'FaHeartbeat' && <FaHeartbeat className="h-4 w-4" />}
                                  </div>
                                ) : (
                                  // Fallback to old logic if no icon is set
                                  <>
                                    {category.name.toLowerCase().includes('government') ? (
                                      <Building className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('safety') ? (
                                      <AlertTriangle className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('information') ? (
                                      <Info className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('weather') || category.name.toLowerCase().includes('environment') ? (
                                      <ThermometerSun className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('nature') ? (
                                      <Leaf className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('transport') ? (
                                      <Car className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('religion') ? (
                                      <Heart className="mr-2 h-4 w-4" />
                                    ) : category.name.toLowerCase().includes('service') ? (
                                      <Store className="mr-2 h-4 w-4" />
                                    ) : (
                                      <Info className="mr-2 h-4 w-4" />
                                    )}
                                  </>
                                )}
                                <span className="font-bold">{category.name}</span>
                              </div>
                            </Link>
                          </div>
                          
                          {/* Links for Government & Regulation */}
                          {((category.slug && category.slug.startsWith('government')) || 
                            (category.name && (category.name.includes('Government') || category.name.includes('Regulation')))) && (
                            <div className="pl-6 mb-4 space-y-2">
                              {/* Render all government pages dynamically from the database and sort by order */}
                              {getPagesForCategory('government-regulations')
                                .sort((a, b) => {
                                  // Sort by order field, defaulting to MAX_SAFE_INTEGER if not set
                                  const orderA = a.order !== null && a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                                  const orderB = b.order !== null && b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
                                  return orderA - orderB;
                                })
                                .map((page) => (
                                  <Link key={page.id} href={`/community/government/${page.slug.replace('government-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                ))
                              }
                            </div>
                          )}
                          
                          {/* Links for Safety & Emergency Services */}
                          {((category.slug && category.slug.startsWith('safety')) || 
                            (category.name && category.name.includes('Safety & Emergency'))) && (
                            <div className="pl-6 mb-4 space-y-2" id="safety-menu-items">
                              {/* Get safety-related pages from database and respect their order */}
                              {getPagesForCategory('safety-emergency-service')
                                .sort((a, b) => (a.order || 0) - (b.order || 0))
                                .map((page) => (
                                  <Link key={page.id} href={`/community/safety/${page.slug.replace('safety-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                ))
                              }
                              
                              {/* If no safety pages were found in the database, fall back to hardcoded links */}
                              {getPagesForCategory('safety-emergency-service').length === 0 && (
                                <>
                                  <Link href="/community/safety/contacts">
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      Important Contacts (Sheriff, Fire, Medical)
                                    </DropdownMenuItem>
                                  </Link>
                                  <Link href="/community/safety/pet-rules">
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      Pet Rules/Safety
                                    </DropdownMenuItem>
                                  </Link>
                                  <Link href="/community/safety/crime">
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      Crimes & Reports
                                    </DropdownMenuItem>
                                  </Link>
                                </>
                              )}
                            </div>
                          )}
                          
                          {/* Links for Community Information */}
                          {((category.slug && category.slug.startsWith('community')) || 
                            (category.name && category.name.includes('Community Information'))) && (
                            <div className="pl-6 mb-4 space-y-2">
                              <Link href="/community/community/history">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Community History
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/community/demographics">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Demographics & Statistics
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/community/snowbirds">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Information for Snowbirds
                                </DropdownMenuItem>
                              </Link>
                              
                              {/* Render additional community pages dynamically */}
                              {getPagesForCategory('community-information').map((page) => (
                                !['history', 'demographics', 'snowbirds'].includes(page.slug.replace('community-', '')) && (
                                  <Link key={page.id} href={`/community/community/${page.slug.replace('community-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                )
                              ))}
                            </div>
                          )}
                          
                          {/* Links for Local Services & Resources */}
                          {((category.slug && category.slug.startsWith('service')) || 
                            (category.name && category.name.includes('Local Services'))) && (
                            <div className="pl-6 mb-4 space-y-2">
                              <Link href="/community/services/restaurants">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Local Restaurants
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/services/hospitals">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Hospitals & Medical Centers
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/services/pharmacies">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Pharmacies
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/services/utilities">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Utilities & Services
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/services/insurance">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Insurance Information
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/services/stores">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Local Stores & Shopping
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/services/tattler">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Barefoot Bay Tattler
                                </DropdownMenuItem>
                              </Link>
                              
                              {/* Render additional service pages dynamically */}
                              {getPagesForCategory('local-services').map((page) => (
                                !['restaurants', 'hospitals', 'pharmacies', 'utilities', 'insurance', 'stores', 'tattler'].includes(page.slug.replace('services-', '')) && (
                                  <Link key={page.id} href={`/community/services/${page.slug.replace('services-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                )
                              ))}
                            </div>
                          )}
                          
                          {/* Links for Nature & Environment */}
                          {((category.slug && category.slug.startsWith('nature')) || 
                            (category.name && (category.name.includes('Nature & Environment')))) && (
                            <div className="pl-6 mb-4 space-y-2">
                              <Link href="/community/nature/wildlife">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Local Wildlife
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/nature/weather">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Weather & Climate
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/nature/beaches">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Beaches & Natural Areas
                                </DropdownMenuItem>
                              </Link>
                              
                              {/* Render nature pages dynamically */}
                              {getPagesForCategory('nature-environment').map((page) => (
                                !['wildlife', 'weather', 'beaches'].includes(page.slug.replace('nature-', '')) && (
                                  <Link key={page.id} href={`/community/nature/${page.slug.replace('nature-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                )
                              ))}
                              
                              {/* Also render amenities pages that belong to this category */}
                              {getPagesForCategory('amenities').map((page) => (
                                <Link key={page.id} href={`/community/amenities/${page.slug.replace('amenities-', '')}`}>
                                  <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                    {page.title}
                                  </DropdownMenuItem>
                                </Link>
                              ))}
                            </div>
                          )}
                          
                          {/* Links for Transportation & Accessibility */}
                          {((category.slug && category.slug.startsWith('transport')) || 
                            (category.name && category.name.includes('Transportation & Accessibility'))) && (
                            <div className="pl-6 mb-4 space-y-2">
                              <Link href="/community/transportation/golf-cart">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Golf Cart Information
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/transportation/shuttle">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Community Shuttle Services
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/transportation/homestead">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Homestead Exemption
                                </DropdownMenuItem>
                              </Link>
                              
                              {/* Render additional transportation pages dynamically */}
                              {getPagesForCategory('transportation-accessibility').map((page) => (
                                !['golf-cart', 'shuttle', 'homestead'].includes(page.slug.replace('transportation-', '')) && (
                                  <Link key={page.id} href={`/community/transportation/${page.slug.replace('transportation-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                )
                              ))}
                            </div>
                          )}
                          
                          {/* Links for Religion & Community Engagement */}
                          {((category.slug && category.slug.startsWith('religion')) || 
                            (category.name && category.name.includes('Religion & Community'))) && (
                            <div className="pl-6 mb-4 space-y-2">
                              <Link href="/community/religion/churches">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Local Churches & Religious Organizations
                                </DropdownMenuItem>
                              </Link>
                              <Link href="/community/religion/submissions">
                                <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                  Community Submissions
                                </DropdownMenuItem>
                              </Link>
                              
                              {/* Render additional religion pages dynamically */}
                              {getPagesForCategory('religion-community').map((page) => (
                                !['churches', 'submissions'].includes(page.slug.replace('religion-', '')) && (
                                  <Link key={page.id} href={`/community/religion/${page.slug.replace('religion-', '')}`}>
                                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral">
                                      {page.title}
                                    </DropdownMenuItem>
                                  </Link>
                                )
                              ))}
                            </div>
                          )}
                        </DropdownMenuGroup>
                      </div>
                    ))
                  ) : (
                    <p className="text-navy/50 italic text-sm p-2">Loading community categories...</p>
                  )}
                  
                  {/* Admin-only manage button */}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator className="my-2 border-t border-navy/10" />
                      <Link href="/admin/manage-pages">
                        <DropdownMenuItem className="text-white bg-coral hover:bg-white hover:text-coral focus:bg-white focus:text-coral border border-transparent hover:border-navy/20 py-2 rounded mt-1 transition-colors">
                          <Settings className="mr-2 h-4 w-4" />
                          <span className="font-medium">Manage Pages</span>
                        </DropdownMenuItem>
                      </Link>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* User menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="h-9 w-9 rounded-full cursor-pointer">
                    <UserAvatar 
                      user={user} 
                      className="h-full w-full" 
                      inNavbar={true}
                      unreadMessages={unreadMessagesCount}
                    />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="dropdown-menu-content w-56 bg-white border border-navy/20 p-4 shadow-lg">
                  <div className="flex flex-col items-center mb-4">
                    <span className="font-medium text-navy text-lg mb-1">{user.fullName || user.username}</span>
                    {user.email && <span className="text-sm text-navy/60">{user.email}</span>}
                  </div>
                  
                  <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2">
                    <Link href="/profile" className="flex items-center w-full">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                    <Link href="/messages" className="flex items-center w-full justify-between">
                      <div className="flex items-center">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        <span>Messages</span>
                      </div>
                      {unreadMessagesCount > 0 && (
                        <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                          {unreadMessagesCount > 99 ? "99+" : unreadMessagesCount}
                        </div>
                      )}
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                    <Link href="/subscriptions" className="flex items-center w-full">
                      <CreditCard className="mr-2 h-4 w-4" />
                      <span>Sponsorship</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                    <Link href="/contact-us" className="flex items-center w-full">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      <span>Contact Us</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  {isAdmin && (
                    <DropdownMenuItem className="hover:bg-coral/10 hover:text-coral focus:bg-coral/10 focus:text-coral py-2 mt-1">
                      <Link href="/admin" className="flex items-center w-full">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Admin Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator className="my-2 border-t border-navy/10" />
                  
                  <DropdownMenuItem 
                    onClick={() => logoutMutation.mutate()} 
                    className="hover:bg-red-50 hover:text-red-500 focus:bg-red-50 focus:text-red-500 text-red-500/90 py-2 mt-1 cursor-pointer"
                  >
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-3">
                <Button 
                  asChild
                  variant="link" 
                  className="text-navy hover:text-coral font-medium transition-colors font-advent-pro text-xl p-0"
                >
                  <Link href="/auth">
                    Log In
                  </Link>
                </Button>
                <Button 
                  asChild
                  className="bg-coral hover:bg-coral/90 text-white font-medium transition-colors font-advent-pro text-xl px-6 py-1 h-auto"
                >
                  <Link href="/auth?tab=register">
                    Sign Up
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </nav>
      
      {/* Mobile menu */}
      <MobileMenu 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)}
        communityCategories={communityCategories}
        isAdmin={isAdmin}
      />
    </div>
  );
}