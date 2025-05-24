import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form"; 
import { zodResolver } from "@hookform/resolvers/zod"; 
import { Plus, DollarSign, Bed, Bath, Ruler, CalendarClock, Filter, X, Tag } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CreateListingForm } from "@/components/for-sale/create-listing-form";
import { ScrollableContent } from "@/components/ui/scrollable-content";
import { ListingCard } from "@/components/for-sale/listing-card";
import { PaymentDialog } from "@/components/for-sale/payment-dialog-fixed";

import { insertListingSchema, type RealEstateListing } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

const LISTING_TYPES = [
  { value: 'FSBO', label: 'For Sale By Owner', color: 'bg-purple-100 text-purple-800' },
  { value: 'Agent', label: 'For Sale By Agent', color: 'bg-blue-100 text-blue-800' },
  { value: 'Rent', label: 'For Rent', color: 'bg-green-100 text-green-800' },
  { value: 'OpenHouse', label: 'Open House', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'Wanted', label: 'Wanted', color: 'bg-red-100 text-red-800' },
  { value: 'Classified', label: 'Classified', color: 'bg-gray-100 text-gray-800' },
  { value: 'GarageSale', label: 'Garage/Yard Sale', color: 'bg-orange-100 text-orange-800' }
];

// Define the categories for Classified listings
const CLASSIFIED_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'Furniture', label: 'Furniture' },
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Clothing', label: 'Clothing' },
  { value: 'Tools', label: 'Tools' },
  { value: 'Garage/Yard Sale', label: 'Garage/Yard Sale' },
  { value: 'Other', label: 'Other' }
];

export default function ForSalePage() {
  const { user } = useAuth();
  const { canCreateListing, isAdmin } = usePermissions();
  const { toast } = useToast();
  const [location] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [currentPaymentId, setCurrentPaymentId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000000]);
  const [isPriceFilterActive, setIsPriceFilterActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [viewingMyListings, setViewingMyListings] = useState(false);
  
  // Publish dialog state
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishingListingId, setPublishingListingId] = useState<number | null>(null);
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  
  // Additional filters
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
  // Set a more reasonable default max value for square feet
  const [squareFeetRange, setSquareFeetRange] = useState<[number, number]>([0, 5000]);
  const [isSquareFeetFilterActive, setIsSquareFeetFilterActive] = useState(false);
  const [yearBuiltRange, setYearBuiltRange] = useState<[number, number]>([1920, new Date().getFullYear()]);
  const [isYearBuiltFilterActive, setIsYearBuiltFilterActive] = useState(false);
  
  // Define status options
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "DRAFT", label: "Drafts" },
    { value: "ACTIVE", label: "Active" },
    { value: "EXPIRED", label: "Expired" }
  ];
  const [isBedroomsOpen, setIsBedroomsOpen] = useState(false);
  const [isBathroomsOpen, setIsBathroomsOpen] = useState(false);
  const [isSquareFeetOpen, setIsSquareFeetOpen] = useState(false);
  const [isYearBuiltOpen, setIsYearBuiltOpen] = useState(false);
  const [isAllFiltersOpen, setIsAllFiltersOpen] = useState(false);
  
  // Count active filters
  const activeFilterCount = [
    isPriceFilterActive,
    bedroomFilter !== null,
    bathroomFilter !== null,
    isSquareFeetFilterActive,
    isYearBuiltFilterActive,
    selectedCategory !== "all", // Add category filter to count
    selectedStatus !== "all"    // Add status filter to count
  ].filter(Boolean).length;
  
  // Parse URL query params to check if we should show "My Listings"
  useEffect(() => {
    const queryParams = new URLSearchParams(location.split('?')[1]);
    const filter = queryParams.get('filter');
    const wasViewingMyListings = viewingMyListings;
    const isNowViewingMyListings = filter === 'my-listings';
    
    setViewingMyListings(isNowViewingMyListings);
    
    // If switching to My Listings view, reset filters to avoid hiding listings
    if (!wasViewingMyListings && isNowViewingMyListings) {
      // Only reset if switching TO my-listings, not when already there
      // Preserve status filter if it's explicitly set in URL
      const statusParam = queryParams.get('status');
      
      // Reset most filters
      setSelectedType("all");
      setSelectedCategory("all");
      if (!statusParam) {
        setSelectedStatus("all"); // Only reset status if not explicitly set in URL
      }
      setBedroomFilter(null);
      setBathroomFilter(null);
      setPriceRange([0, 1000000]);
      setIsPriceFilterActive(false);
      setSquareFeetRange([0, 5000]);
      setIsSquareFeetFilterActive(false);
      setYearBuiltRange([1920, new Date().getFullYear()]);
      setIsYearBuiltFilterActive(false);
      
      console.log("[DEBUG] Filters reset when switching to My Listings view");
    }
  }, [location, viewingMyListings]);
  
  const { 
    data: listings = [], 
    isLoading,
    isError,
    error,
  } = useQuery<RealEstateListing[]>({
    queryKey: ["/api/listings", viewingMyListings ? user?.id : null],
    queryFn: async () => {
      try {
        // Use fetch directly instead of apiRequest to avoid authentication errors
        let url = "/api/listings";
        
        // Add user ID filter for "My Listings"
        if (viewingMyListings && user?.id) {
          url += `?userId=${user.id}`;
        }
        
        console.log(`[DEBUG] Fetching listings from ${url}`);
        const response = await fetch(url);
        
        // Check for non-200 response and handle it
        if (!response.ok) {
          console.error(`[DEBUG] Error response from ${url}:`, {
            status: response.status,
            statusText: response.statusText
          });
          
          // Try to parse error message from response body
          let errorMessage = `Error ${response.status}: ${response.statusText}`;
          try {
            const errorData = await response.json();
            console.error("[DEBUG] Error response body:", errorData);
            if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (parseError) {
            console.error("[DEBUG] Could not parse error response as JSON:", parseError);
          }
          
          throw new Error(errorMessage);
        }
        
        // Parse and validate response data
        const data = await response.json();
        console.log(`[DEBUG] Successfully fetched ${data.length || 0} listings`);
        
        // Return empty array if data is not an array to prevent rendering errors
        if (!Array.isArray(data)) {
          console.error("[DEBUG] Expected array of listings but got:", typeof data);
          return [];
        }
        
        return data;
      } catch (err) {
        console.error("Error fetching listings:", err);
        // Add specific error handling based on error type
        if (err instanceof TypeError && err.message.includes('NetworkError')) {
          toast({
            title: "Network Error",
            description: "Could not connect to the server. Please check your internet connection.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error Loading Listings",
            description: "There was a problem retrieving real estate listings. Please try again later.",
            variant: "destructive"
          });
        }
        // Return empty array instead of throwing to prevent the UI from crashing
        return [];
      }
    },
    // Re-fetch when the viewingMyListings state changes or user changes
    enabled: !viewingMyListings || !!user,
  });

  // Admin delete mutation
  const deleteListingMutation = useMutation({
    mutationFn: async (listingId: number) => {
      const res = await apiRequest("DELETE", `/api/listings/${listingId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete listing");
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      toast({
        title: "Success",
        description: "Listing deleted successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("Delete listing error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete listing. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Function to handle edit listing
  const handleEditListing = (listingId: number) => {
    // Navigate to listing detail page where the dialog will be used
    window.location.href = `/for-sale/${listingId}`;
  };

  // Function to handle delete confirmation
  const handleDeleteListing = async (listingId: number) => {
    if (window.confirm("Are you sure you want to delete this listing? This action cannot be undone.")) {
      try {
        await deleteListingMutation.mutateAsync(listingId);
      } catch (error) {
        console.error("Error deleting listing:", error);
      }
    }
  };
  
  // Function to handle publishing a draft listing
  const handlePublishListing = (listingId: number) => {
    // Set the listing ID to publish and open the publish dialog
    setPublishingListingId(listingId);
    setIsPublishDialogOpen(true);
  };
  
  // Handle proceed to payment in the publish dialog
  const handlePublishPayment = () => {
    if (!publishingListingId) return;
    
    // Close the publish dialog and open the payment dialog
    setIsPublishDialogOpen(false);
    setIsPaymentDialogOpen(true);
  };
  
  // Handle publishing a draft listing with a payment
  const handlePublishDraftWithPayment = async (listingId: number, paymentId: number) => {
    try {
      // Call the API to publish the listing
      const response = await fetch(`/api/listings/${listingId}/publish`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          paymentId, 
          duration: "30 days" // Default duration for real estate listings
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to publish listing");
      }
      
      // Success - refresh the listings
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/listings", user.id] });
      }
      
      // Show success toast
      toast({
        title: "Success",
        description: "Your listing has been published successfully.",
      });
      
      // Reset state
      setPublishingListingId(null);
      setIsPaymentDialogOpen(false);
    } catch (error) {
      console.error("Error publishing listing:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to publish listing. Please try again.",
        variant: "destructive",
      });
    }
  };

  const createListingMutation = useMutation({
    mutationFn: async (data: typeof insertListingSchema._type) => {
      try {
        console.log("Creating listing with payment ID:", currentPaymentId);
        console.log("Listing data status:", data.status);
        
        // Check if this is a draft listing (can be saved without payment)
        const isDraft = data.status === "DRAFT";
        
        // Only require payment for non-draft listings
        if (!isDraft && !currentPaymentId) {
          console.error("No payment ID available when attempting to create active listing");
          toast({
            title: "Payment Required",
            description: "Payment is required to publish a listing. Please complete payment first or save as draft.",
            variant: "destructive"
          });
          throw new Error("Payment required to create an active listing");
        }
        
        let uploadedUrls: string[] = [];

        // Handle file uploads first
        if (selectedFiles.length > 0) {
          const formData = new FormData();
          
          // Important: Add real-estate type for proper server-side handling
          formData.append("type", "real-estate");
          
          selectedFiles.forEach((file) => {
            formData.append("media", file);
          });
          
          console.log("Uploading files:", selectedFiles.length, "files for real-estate");
          console.log("File types:", selectedFiles.map(f => f.type).join(", "));
          console.log("File sizes:", selectedFiles.map(f => `${Math.round(f.size/1024)}KB`).join(", "));

          // Use the specialized real estate media upload endpoint that supports larger files
          const response = await fetch("/api/upload/real-estate-media", {
            method: "POST",
            credentials: 'include',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to upload images");
          }

          const uploadData = await response.json();
          
          // Handle the response from the specialized real estate endpoint
          if (uploadData.mediaUrls && uploadData.mediaUrls.length > 0) {
            uploadedUrls = uploadData.mediaUrls;
            console.log("Successfully uploaded real estate images:", uploadedUrls);
          } else if (uploadData.success && uploadData.urls) {
            // Fallback for standard upload endpoint response format
            uploadedUrls = uploadData.urls;
          } else {
            throw new Error(uploadData.message || "Failed to upload images");
          }
        }

        // Prepare listing data
        const listingData = {
          ...data,
          // Ensure numeric fields are properly typed
          price: Number(data.price) || 0,
          bedrooms: Number(data.bedrooms) || 0,
          bathrooms: Number(data.bathrooms) || 0,
          squareFeet: Number(data.squareFeet) || 0,
          yearBuilt: Number(data.yearBuilt) || 0,
          // Include uploaded photos
          photos: uploadedUrls,
          // Ensure contact info is properly formatted
          contactInfo: {
            name: data.contactInfo?.name?.trim() || '',
            phone: data.contactInfo?.phone?.trim() || '',
            email: data.contactInfo?.email?.trim() || '',
          },
          // Fix expirationDate to ensure it's a Date object and not a string
          expirationDate: data.expirationDate instanceof Date 
            ? data.expirationDate 
            : typeof data.expirationDate === 'string' 
              ? new Date(data.expirationDate) 
              : null
        };

        // Include the payment ID with the listing data
        const payload = {
          listingData: {
            ...listingData,
            // Set status to DRAFT if we're in draft mode
            status: isDraftMode ? "DRAFT" : "ACTIVE"
          },
          paymentId: currentPaymentId
        };

        // Enhanced debugging of critical fields
        // Use a safer JSON stringify approach for Date objects
        const safeStringify = (obj: any) => {
          return JSON.stringify(obj, (key, value) => {
            if (value instanceof Date) {
              return { 
                __type: 'Date', 
                value: value.toISOString() 
              };
            }
            return value;
          }, 2);
        };
        
        console.log("Submitting listing data:", safeStringify(payload));
        console.log("Payment ID type:", typeof currentPaymentId);
        console.log("Payment ID value:", currentPaymentId);
        console.log("expirationDate before submission:", data.expirationDate);
        console.log("expirationDate after processing:", 
                   listingData.expirationDate instanceof Date 
                   ? listingData.expirationDate.toISOString() 
                   : listingData.expirationDate);
        console.log("expirationDate is Date object:", listingData.expirationDate instanceof Date);
        const res = await apiRequest("POST", "/api/listings", payload);

        if (!res.ok) {
          const errorData = await res.json();
          console.error("Server validation errors:", JSON.stringify(errorData, null, 2));

          // Enhanced error handling with detailed formatting
          let errorMessage = "Failed to create listing";
          
          if (errorData.errors && Array.isArray(errorData.errors)) {
            // Format errors more nicely for display
            errorMessage = "Validation errors:\n" + errorData.errors.map((err: any) => 
              `• ${err.path}: ${err.message}`
            ).join('\n');
            
            // Log detailed debug information
            console.error("Create listing error details:", {
              errorType: typeof errorData,
              errorObject: errorData,
              errorString: JSON.stringify(errorData),
              errorStack: new Error().stack,
              errorMessage: errorData.message
            });
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }

          throw new Error(errorMessage);
        }

        return await res.json();
      } catch (error) {
        // Enhanced error logging with more detail
        console.error("Mutation error:", error);
        console.error("Mutation error details:", {
          errorType: typeof error,
          errorObject: error,
          errorString: String(error),
          errorStack: error instanceof Error ? error.stack : 'No stack trace available',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Handle Response objects to extract validation errors
        if (error instanceof Response || (error as any)?.response instanceof Response) {
          const response = error instanceof Response ? error : (error as any).response;
          
          // Extract the response body
          try {
            response.json().then((data: any) => {
              console.error("API Response data:", data);
              
              // Format validation errors for the user
              if (data?.errors?.length > 0) {
                const errorDetails = data.errors.map((e: any) => 
                  `- ${e.path}: ${e.message}`
                ).join('\n');
                
                toast({
                  title: data.message || "Validation Error",
                  description: `Please fix the following:\n${errorDetails}`,
                  variant: "destructive",
                });
              }
            }).catch(e => {
              console.error("Error parsing response JSON:", e);
            });
          } catch (jsonError) {
            console.error("Failed to parse response JSON:", jsonError);
          }
        }
        
        // If this is related to file uploads, provide more specific error message
        if (String(error).includes("upload") || String(error).includes("media") || String(error).includes("file")) {
          throw new Error("Error uploading listing images. Please try again with smaller images or fewer images.");
        }
        
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    onSuccess: () => {
      // Invalidate both the main listings query and any filtered queries
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      setIsDialogOpen(false);
      setSelectedFiles([]);
      setCurrentPaymentId(null);
      toast({
        title: "Success",
        description: "Listing created successfully. It will be visible after approval.",
      });
      
      // If creating a listing while viewing "My Listings", make sure those get refreshed too
      if (viewingMyListings && user?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/listings", user.id] });
      }
    },
    onError: (error: any) => {
      // Enhanced error logging with more detail
      console.error("Create listing error:", error);
      console.error("Create listing error details:", {
        errorType: typeof error,
        errorObject: error,
        errorString: String(error),
        errorStack: error.stack || 'No stack trace available',
        errorMessage: error.message || 'Unknown error'
      });
      
      // Attempt to parse validation errors from the response
      if (error.response) {
        try {
          // Clone the response to avoid "body already read" errors
          error.response.clone().json().then((data: any) => {
            console.error("API Error Response data:", data);
            
            // Format validation errors for the user
            if (data?.errors?.length > 0) {
              const errorDetails = data.errors.map((e: any) => 
                `- ${e.path}: ${e.message}`
              ).join('\n');
              
              toast({
                title: data.message || "Validation Error",
                description: `Please fix the following:\n${errorDetails}`,
                variant: "destructive",
              });
              return;
            }
          }).catch(e => {
            console.error("Error parsing response JSON in onError:", e);
          });
        } catch (jsonError) {
          console.error("Failed to parse response JSON in onError:", jsonError);
        }
      }
      
      // Provide more specific error messages based on error content
      let errorMessage = error.message || "Failed to create listing. Please try again.";
      
      if (errorMessage.includes("No files were successfully processed")) {
        errorMessage = "Failed to upload listing images. Please try again with smaller images or fewer images.";
      } else if (errorMessage.includes("payment") || errorMessage.includes("Payment")) {
        errorMessage = "Payment verification failed. Please try verifying your payment again.";
      } else if (errorMessage.includes("Invalid listing data")) {
        if (error.response) {
          // Try to extract validation errors from the response JSON
          error.response.clone().json().then(data => {
            if (data?.errors?.length > 0) {
              const errorList = data.errors.map((e: any) => `- ${e.path}: ${e.message}`).join('\n');
              toast({
                title: "Validation Error",
                description: `Please fix these issues:\n${errorList}`,
                variant: "destructive",
              });
            }
          }).catch(e => console.error("Error parsing validation errors:", e));
        }
        errorMessage = "Please check the form for errors and try again. Make sure all required fields are filled correctly.";
      }
      
      // If we have specific validation errors, use those instead
      if (error.response && !errorMessage.includes("HTTP error")) {
        toast({
          title: "Error Creating Listing",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  // Calculate price range for slider
  useEffect(() => {
    if (listings.length > 0) {
      const pricesWithValues = listings
        .filter(listing => listing.price !== null && listing.price !== undefined)
        .map(listing => listing.price as number);
      
      if (pricesWithValues.length > 0) {
        const minPrice = Math.min(...pricesWithValues);
        const maxPrice = Math.max(...pricesWithValues);
        
        // Only update if the user hasn't adjusted the price filter
        if (!isPriceFilterActive) {
          setPriceRange([minPrice, maxPrice]);
        }
      }
    }
  }, [listings, isPriceFilterActive]);

  // Add debug logging to track the listings data
  console.log(`[DEBUG] Filtering ${listings.length} listings (viewingMyListings: ${viewingMyListings})`);
  console.log(`[DEBUG] Active filters:`, {
    type: selectedType,
    category: selectedCategory,
    status: selectedStatus,
    priceRange: isPriceFilterActive ? priceRange : 'inactive',
    bedroomFilter,
    bathroomFilter,
    squareFeetRange: isSquareFeetFilterActive ? squareFeetRange : 'inactive',
    yearBuiltRange: isYearBuiltFilterActive ? yearBuiltRange : 'inactive',
  });
  
  // Apply filters (type, category, price, bedrooms, bathrooms, square feet, year built)
  const filteredListings = listings.filter(listing => {
    // Skip invalid listings
    if (!listing || !listing.listingType) return false;
    
    // Type filter
    const typeMatch = selectedType === "all" || listing.listingType === selectedType;
    
    // Category filter - only applies to Classified listings
    let categoryMatch = true;
    if (selectedType === "Classified" && selectedCategory !== "all") {
      categoryMatch = listing.category === selectedCategory;
    }
    
    // Price filter - only apply to listings with a price and if the filter is active
    let priceMatch = true;
    if (isPriceFilterActive && listing.price !== null && listing.price !== undefined) {
      priceMatch = listing.price >= priceRange[0] && listing.price <= priceRange[1];
    }
    
    // Only apply bedroom/bathroom filters to real estate listing types
    const isRealEstateType = ['FSBO', 'Agent', 'Rent', 'OpenHouse'].includes(listing.listingType);
    
    // Bedrooms filter
    let bedroomsMatch = true;
    if (bedroomFilter !== null) {
      // If bedroom filter is active but this is not a real estate listing, exclude it
      if (!isRealEstateType) {
        bedroomsMatch = false;
      } else if (listing.bedrooms !== null && listing.bedrooms !== undefined) {
        bedroomsMatch = listing.bedrooms >= bedroomFilter;
      } else {
        // If no bedroom data but real estate listing, exclude it when filter is active
        bedroomsMatch = false;
      }
    }
    
    // Bathrooms filter
    let bathroomsMatch = true;
    if (bathroomFilter !== null) {
      // If bathroom filter is active but this is not a real estate listing, exclude it
      if (!isRealEstateType) {
        bathroomsMatch = false;
      } else if (listing.bathrooms !== null && listing.bathrooms !== undefined) {
        bathroomsMatch = listing.bathrooms >= bathroomFilter;
      } else {
        // If no bathroom data but real estate listing, exclude it when filter is active
        bathroomsMatch = false;
      }
    }
    
    // Square feet filter
    let squareFeetMatch = true;
    if (isSquareFeetFilterActive) {
      // If square feet filter is active but this is not a real estate listing, exclude it
      if (!isRealEstateType) {
        squareFeetMatch = false;
      } else if (listing.squareFeet !== null && listing.squareFeet !== undefined) {
        // Convert to number to ensure proper comparison
        const squareFeetValue = Number(listing.squareFeet);
        if (!isNaN(squareFeetValue)) {
          squareFeetMatch = squareFeetValue >= squareFeetRange[0] && squareFeetValue <= squareFeetRange[1];
        } else {
          squareFeetMatch = false;
        }
      } else {
        // If no square feet data but real estate listing, exclude it when filter is active
        squareFeetMatch = false;
      }
    }
    
    // Year built filter
    let yearBuiltMatch = true;
    if (isYearBuiltFilterActive) {
      // If year built filter is active but this is not a real estate listing, exclude it
      if (!isRealEstateType) {
        yearBuiltMatch = false;
      } else if (listing.yearBuilt !== null && listing.yearBuilt !== undefined) {
        yearBuiltMatch = listing.yearBuilt >= yearBuiltRange[0] && listing.yearBuilt <= yearBuiltRange[1];
      } else {
        // If no year built data but real estate listing, exclude it when filter is active
        yearBuiltMatch = false;
      }
    }
    
    // Status filter - ensure it properly handles cases where status might be undefined
    // Also handle special case for admin users who should see all draft listings
    let statusMatch = true;
    if (selectedStatus !== "all") {
      // If status is explicitly selected, require it to match
      statusMatch = listing.status === selectedStatus;
    }
    
    // When in "All Listings" view (not viewing My Listings), non-admin users 
    // should not see any draft listings unless they created them
    if (!viewingMyListings && !isAdmin && listing.status === "DRAFT" && selectedStatus === "all") {
      // Only show drafts to their creators (when not explicitly filtering by status)
      statusMatch = user && listing.createdBy === user.id;
    }
    
    const result = typeMatch && categoryMatch && statusMatch && priceMatch && 
                   bedroomsMatch && bathroomsMatch && squareFeetMatch && yearBuiltMatch;
                   
    // Log detailed filter results for debugging when needed
    if (viewingMyListings && !result) {
      console.log(`[DEBUG] Filtering out listing ${listing.id}: `, {
        typeMatch,
        categoryMatch,
        statusMatch,
        priceMatch,
        bedroomsMatch,
        bathroomsMatch,
        squareFeetMatch,
        yearBuiltMatch,
        listingStatus: listing.status
      });
    }
    
    return result;
  });
  
  // Log how many listings were filtered out
  console.log(`[DEBUG] After filtering: ${filteredListings.length} listings remain`);

  // Create a safe copy for sorting
  const sortedListings = [...filteredListings]
    .filter(listing => listing && listing.id) // Ensure only valid listings are included
    .sort((a, b) => {
      // Safely access created date
      const dateA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  
  // Number formatter for price display
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
  });
  
  // Shorter formatter for button display (K for thousands, M for millions)
  const shortFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

  // Handler for payment success
  // Add state to store the selected listing duration
  const [currentListingDuration, setCurrentListingDuration] = useState<string | null>(null);

  const handlePaymentSuccess = (paymentId: number, listingType?: string, listingDuration?: string) => {
    console.log("Payment success! Payment ID:", paymentId, "Listing Type:", listingType, "Duration:", listingDuration);
    
    // Special case: If payment ID is -1, this means "Save as Draft" was selected
    const isDraftMode = paymentId === -1;
    
    // If we're publishing an existing draft listing
    if (publishingListingId) {
      console.log("Publishing draft listing:", publishingListingId, "with payment:", paymentId);
      // Call the function to handle publishing a draft with payment
      handlePublishDraftWithPayment(publishingListingId, paymentId);
      return;
    }
    
    // Otherwise, this is for creating a new listing
    setCurrentPaymentId(paymentId);
    
    // If a listing type was selected during payment, update the selected type
    if (listingType) {
      setSelectedType(listingType);
    }
    
    // Store the listing duration to calculate expiration date in the listing form
    if (listingDuration) {
      setCurrentListingDuration(listingDuration);
    }
    
    setIsPaymentDialogOpen(false);
    
    // Add a small delay to ensure state is updated before opening dialog
    setTimeout(() => {
      console.log("Opening listing dialog with Payment ID:", paymentId, "Draft mode:", isDraftMode);
      // Set draft mode flag to be used when submitting the listing form
      setIsDraftMode(isDraftMode);
      setIsDialogOpen(true);
    }, 100);
  };
  
  // Reset all filters
  const resetAllFilters = () => {
    // Reset type filter
    setSelectedType("all");
    // Reset category filter
    setSelectedCategory("all");
    // Reset status filter
    setSelectedStatus("all");
    
    // Reset price filter
    const pricesWithValues = listings
      .filter(listing => listing.price !== null && listing.price !== undefined)
      .map(listing => listing.price as number);
    
    if (pricesWithValues.length > 0) {
      // Round to the nearest 1000
      const minPrice = Math.floor(Math.min(...pricesWithValues) / 1000) * 1000;
      const maxPrice = Math.ceil(Math.max(...pricesWithValues) / 1000) * 1000;
      setPriceRange([minPrice, maxPrice]);
    } else {
      setPriceRange([0, 1000000]);
    }
    setIsPriceFilterActive(false);
    
    console.log("[DEBUG] All filters have been reset");
    
    // Reset bedroom/bathroom filters
    setBedroomFilter(null);
    setBathroomFilter(null);
    
    // Reset square feet filter
    setSquareFeetRange([0, 5000]);
    setIsSquareFeetFilterActive(false);
    
    // Reset year built filter
    setYearBuiltRange([1920, new Date().getFullYear()]);
    setIsYearBuiltFilterActive(false);
    
    // Close all filter menus
    setIsAllFiltersOpen(false);
  };
  
  // We already have isAdmin from usePermissions above

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      {/* Payment Dialog */}
      <PaymentDialog 
        open={isPaymentDialogOpen}
        onOpenChange={setIsPaymentDialogOpen}
        onSuccess={handlePaymentSuccess}
      />
      
      {/* Publish Dialog - for publishing draft listings */}
      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Listing</DialogTitle>
            <DialogDescription>
              Publishing this listing will make it visible to all users and requires payment. Your listing will remain active for 30 days.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p>Ready to publish your draft listing?</p>
            <p className="text-sm text-muted-foreground">
              After payment, your listing will be published immediately and visible to all users.
            </p>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPublishDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handlePublishPayment}
              disabled={!publishingListingId}
            >
              Proceed to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Admin notification banner */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-blue-800">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Admin View</h3>
              <div className="mt-1 text-sm text-blue-700">
                <p>As an admin, you have access to all draft listings, including those created by other users. {!viewingMyListings && selectedStatus === "all" && "Draft listings from all users are shown with a badge."}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="hidden sm:block">
          <h1 className="text-3xl font-bold">
            {viewingMyListings ? "My For Sale Listings" : "For Sale Listings"}
          </h1>
          <p className="text-muted-foreground">
            {viewingMyListings 
              ? "Manage your property listings in Barefoot Bay" 
              : "Browse property listings in Barefoot Bay, including For Sale By Owner (FSBO), Agent listings, Rentals, Open Houses, Wanted items, and Classifieds. Property listings remain active for 30 days, while Open Houses, Yard Sales, Wanted items, and Classifieds are available for 3-7 days depending on the listing type. Registered users can create listings subject to approval."
            }
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Listings</SelectItem>
              {LISTING_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter Dropdown - shown only for My Listings view */}
          {viewingMyListings && (
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* All Filters Button */}
          <Dialog open={isAllFiltersOpen} onOpenChange={setIsAllFiltersOpen}>
            <DialogTrigger asChild>
              <Button 
                variant={activeFilterCount > 0 ? "secondary" : "outline"}
                className="w-[200px] justify-between"
              >
                <div className="flex items-center">
                  <Filter className="h-4 w-4 mr-2" />
                  <span>All Filters</span>
                </div>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs ml-2">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] h-[80vh]">
              <ScrollableContent maxHeight="calc(80vh - 60px)">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Property Filters</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetAllFilters}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reset all
                </Button>
              </div>
              
              {/* Category Filter - Only shown when Classified is selected */}
              {selectedType === "Classified" && (
                <div className="border-b pb-6 mb-6">
                  <h4 className="font-medium mb-4 flex items-center">
                    <Tag className="h-4 w-4 mr-2" />
                    Category
                  </h4>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="Furniture">Furniture</SelectItem>
                      <SelectItem value="Electronics">Electronics</SelectItem>
                      <SelectItem value="Clothing">Clothing</SelectItem>
                      <SelectItem value="Tools">Tools</SelectItem>
                      <SelectItem value="Garage/Yard Sale">Garage/Yard Sale</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Price Range Filter */}
              <div className="border-b pb-6 mb-6">
                <h4 className="font-medium mb-4 flex items-center">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Price Range
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="minPrice" className="text-sm font-medium">Min Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground font-medium">$</span>
                      <input
                        id="minPrice"
                        type="text"
                        inputMode="numeric"
                        placeholder="Min"
                        value={priceRange[0] > 0 ? priceRange[0].toLocaleString() : ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          // Remove non-numeric characters and validate as number
                          const value = e.target.value.replace(/[^\d]/g, '');
                          
                          // Empty value handling
                          if (value === '') {
                            setPriceRange([0, priceRange[1]]);
                            setIsPriceFilterActive(true);
                            return;
                          }
                          
                          const numValue = parseInt(value, 10);
                          
                          // Only update if it's a valid number
                          if (!isNaN(numValue) && numValue >= 0) {
                            setPriceRange([numValue, priceRange[1]]);
                            setIsPriceFilterActive(true);
                          }
                        }}
                        className="pl-8 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="maxPrice" className="text-sm font-medium">Max Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground font-medium">$</span>
                      <input
                        id="maxPrice"
                        type="text"
                        inputMode="numeric"
                        placeholder="Max"
                        value={priceRange[1] > 0 ? priceRange[1].toLocaleString() : ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          // Remove non-numeric characters and validate as number
                          const value = e.target.value.replace(/[^\d]/g, '');
                          
                          // Empty value handling
                          if (value === '') {
                            setPriceRange([priceRange[0], 0]);
                            setIsPriceFilterActive(true);
                            return;
                          }
                          
                          const numValue = parseInt(value, 10);
                          
                          // Only update if it's a valid number
                          if (!isNaN(numValue) && numValue >= 0) {
                            setPriceRange([priceRange[0], numValue]);
                            setIsPriceFilterActive(true);
                          }
                        }}
                        className="pl-8 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bedrooms Filter */}
              <div className="border-b pb-6 mb-6">
                <h4 className="font-medium mb-4 flex items-center">
                  <Bed className="h-4 w-4 mr-2" />
                  Bedrooms
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[null, 1, 2, 3, 4, 5].map((value) => (
                    <Button
                      key={value === null ? 'any' : value}
                      variant={bedroomFilter === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBedroomFilter(value)}
                      className="flex-1"
                    >
                      {value === null ? 'Any' : `${value}+`}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Bathrooms Filter */}
              <div className="border-b pb-6 mb-6">
                <h4 className="font-medium mb-4 flex items-center">
                  <Bath className="h-4 w-4 mr-2" />
                  Bathrooms
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[null, 1, 2, 3, 4].map((value) => (
                    <Button
                      key={value === null ? 'any' : value?.toString()}
                      variant={bathroomFilter === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBathroomFilter(value)}
                      className={value === null ? "flex-1" : ""}
                    >
                      {value === null ? 'Any' : `${value}+`}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Square Feet Filter */}
              <div className="border-b pb-6 mb-6">
                <h4 className="font-medium mb-4 flex items-center">
                  <Ruler className="h-4 w-4 mr-2" />
                  Square Feet Range
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="minSqft" className="text-sm font-medium">Min Sq.Ft.</label>
                    <input
                      id="minSqft"
                      type="text"
                      inputMode="numeric"
                      placeholder="Min"
                      value={squareFeetRange[0] > 0 ? squareFeetRange[0].toLocaleString() : ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        // Remove non-numeric characters and validate as number
                        const value = e.target.value.replace(/[^\d]/g, '');
                        
                        // Empty value handling
                        if (value === '') {
                          setSquareFeetRange([0, squareFeetRange[1]]);
                          setIsSquareFeetFilterActive(true);
                          return;
                        }
                        
                        const numValue = parseInt(value, 10);
                        
                        // Only update if it's a valid number
                        if (!isNaN(numValue) && numValue >= 0) {
                          setSquareFeetRange([numValue, squareFeetRange[1]]);
                          setIsSquareFeetFilterActive(true);
                        }
                      }}
                      className="pl-4 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="maxSqft" className="text-sm font-medium">Max Sq.Ft.</label>
                    <input
                      id="maxSqft"
                      type="text"
                      inputMode="numeric"
                      placeholder="Max"
                      value={squareFeetRange[1] > 0 ? squareFeetRange[1].toLocaleString() : ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        // Remove non-numeric characters and validate as number
                        const value = e.target.value.replace(/[^\d]/g, '');
                        
                        // Empty value handling
                        if (value === '') {
                          setSquareFeetRange([squareFeetRange[0], 5000]);
                          setIsSquareFeetFilterActive(true);
                          return;
                        }
                        
                        const numValue = parseInt(value, 10);
                        
                        // Only update if it's a valid number
                        if (!isNaN(numValue) && numValue >= 0) {
                          setSquareFeetRange([squareFeetRange[0], numValue]);
                          setIsSquareFeetFilterActive(true);
                        }
                      }}
                      className="pl-4 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              
              {/* Year Built Filter */}
              <div className="pb-4">
                <h4 className="font-medium mb-4 flex items-center">
                  <CalendarClock className="h-4 w-4 mr-2" />
                  Year Built Range
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="minYear" className="text-sm font-medium">From</label>
                    <input
                      id="minYear"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Min"
                      value={yearBuiltRange[0] > 0 ? yearBuiltRange[0].toString() : ''}
                      onFocus={(e) => {
                        // Force cursor to end of text and select all text
                        // This is critical for mobile where cursor might appear in the wrong position
                        e.target.setSelectionRange(0, e.target.value.length);
                      }}
                      onClick={(e) => {
                        // Ensure clicking anywhere in the field selects all text
                        e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
                      }}
                      onChange={(e) => {
                        const value = e.target.value;
                        
                        // Handle empty value
                        if (value === '') {
                          setYearBuiltRange([0, yearBuiltRange[1]]);
                          setIsYearBuiltFilterActive(true);
                          return;
                        }
                        
                        // Only allow numbers
                        if (!/^\d*$/.test(value)) return;
                        
                        // Parse the numeric value
                        const numValue = parseInt(value, 10);
                        
                        // Update state even if it's a partial number
                        if (!isNaN(numValue)) {
                          if (numValue <= new Date().getFullYear()) {
                            setYearBuiltRange([numValue, yearBuiltRange[1]]);
                            setIsYearBuiltFilterActive(true);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        // If the value is empty or less than 1900, reset to 1900 on blur
                        const value = e.target.value;
                        const numValue = parseInt(value, 10);
                        
                        if (value === '' || isNaN(numValue) || numValue < 1900) {
                          setYearBuiltRange([1900, yearBuiltRange[1]]);
                        }
                      }}
                      className="pl-4 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="maxYear" className="text-sm font-medium">To</label>
                    <input
                      id="maxYear"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Max"
                      value={yearBuiltRange[1] > 0 ? yearBuiltRange[1].toString() : ''}
                      onFocus={(e) => {
                        // Force cursor to end of text and select all text
                        // This is critical for mobile where cursor might appear in the wrong position
                        e.target.setSelectionRange(0, e.target.value.length);
                      }}
                      onClick={(e) => {
                        // Ensure clicking anywhere in the field selects all text
                        e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
                      }}
                      onChange={(e) => {
                        const value = e.target.value;
                        
                        // Handle empty value
                        if (value === '') {
                          setYearBuiltRange([yearBuiltRange[0], 0]);
                          setIsYearBuiltFilterActive(true);
                          return;
                        }
                        
                        // Only allow numbers
                        if (!/^\d*$/.test(value)) return;
                        
                        // Parse the numeric value
                        const numValue = parseInt(value, 10);
                        
                        // Update state even if it's a partial number
                        if (!isNaN(numValue)) {
                          setYearBuiltRange([yearBuiltRange[0], numValue]);
                          setIsYearBuiltFilterActive(true);
                        }
                      }}
                      onBlur={(e) => {
                        // If the value is empty or less than 1900, reset to current year on blur
                        const value = e.target.value;
                        const numValue = parseInt(value, 10);
                        const currentYear = new Date().getFullYear();
                        
                        if (value === '' || isNaN(numValue) || numValue < 1900) {
                          setYearBuiltRange([yearBuiltRange[0], currentYear]);
                        } else if (numValue > currentYear) {
                          setYearBuiltRange([yearBuiltRange[0], currentYear]);
                        }
                      }}
                      className="pl-4 pr-4 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={resetAllFilters}
                >
                  Reset All
                </Button>
                <Button 
                  onClick={() => setIsAllFiltersOpen(false)}
                >
                  Apply Filters
                </Button>
              </div>
              </ScrollableContent>
            </DialogContent>
          </Dialog>

          <div className="hidden md:flex gap-2 items-center">
            {canCreateListing ? (
              <div className="flex gap-2">
                {/* Create Draft option (no payment required) */}
                <Button 
                  variant="outline" 
                  onClick={() => {
                    // Open dialog directly without payment
                    setIsDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Draft
                </Button>
                
                {/* Regular Add Listing (with payment) */}
                <Button onClick={() => setIsPaymentDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Listing
                </Button>
              </div>
            ) : user ? (
              <div className="space-y-2">
                <Button disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Account Blocked
                </Button>
                <p className="text-sm text-muted-foreground">
                  Your account is currently blocked.
                  Please contact an administrator for assistance.
                </p>
              </div>
            ) : (
              <Link href="/auth">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Login to Add Listing
                </Button>
              </Link>
            )}
          </div>
          
          {/* Listing dialog */}
          <Dialog 
            open={isDialogOpen} 
            onOpenChange={(open) => {
              console.log("Dialog open change:", open, "Payment ID:", currentPaymentId);
              // If closing the dialog, reset everything
              if (!open) {
                setIsDialogOpen(false);
                // Don't reset currentPaymentId here, as we need it for form submission
              } else {
                setIsDialogOpen(open);
              }
            }}
          >
            <DialogContent className="max-w-2xl h-[90vh]">
              <DialogHeader>
                <DialogTitle>Create New Listing</DialogTitle>
              </DialogHeader>
              <ScrollableContent maxHeight="calc(90vh - 120px)">
                <CreateListingForm
                  onSubmit={(data) => createListingMutation.mutate(data)}
                  isSubmitting={createListingMutation.isPending}
                  selectedFiles={selectedFiles}
                  setSelectedFiles={setSelectedFiles}
                  listingDuration={currentListingDuration}
                  selectedType={selectedType !== "all" ? selectedType : undefined}
                />
              </ScrollableContent>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : isError ? (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">Unable to Load Listings</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-4">
            {error instanceof Error ? error.message : "An error occurred while loading listings."}
          </p>
          <Link href="/auth">
            <Button>
              Sign In to View Listings
            </Button>
          </Link>
        </div>
      ) : sortedListings.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-lg text-muted-foreground">
            {viewingMyListings 
              ? "No listings found matching your filters. If you've created listings, try resetting the filters."
              : "No listings found matching your search criteria."
            }
          </p>
          {activeFilterCount > 0 && (
            <Button 
              variant="outline" 
              onClick={resetAllFilters} 
              className="mt-4"
            >
              Reset All Filters
            </Button>
          )}
          {viewingMyListings && listings.length === 0 && (
            <div className="mt-6">
              <p className="text-muted-foreground mb-4">You haven't created any listings yet.</p>
              <Button asChild>
                <Link href="#" onClick={() => setIsDialogOpen(true)}>
                  Create Your First Listing
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedListings.map((listing) => (
            <div key={listing.id} className="relative">
              {listing.status === "DRAFT" && (
                <div className="absolute top-0 left-0 right-0 z-10 bg-amber-500 text-white font-bold px-3 py-2 text-center">
                  DRAFT LISTING - Not Published
                </div>
              )}
              <div className={listing.status === "DRAFT" ? "border-4 border-amber-500 rounded-lg overflow-hidden mt-8" : ""}>
                <ListingCard 
                  listing={listing} 
                  listingTypes={LISTING_TYPES}
                  isAdmin={isAdmin}
                  currentUserId={user?.id}
                  onEdit={handleEditListing}
                  onDelete={handleDeleteListing}
                  onPublish={listing.status === "DRAFT" ? handlePublishListing : undefined}
                  onClick={() => window.location.href = `/for-sale/${listing.id}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Payment system diagnostics moved to Advanced Settings */}
      
      {/* Floating Action Button for mobile and landscape mode */}
      {canCreateListing ? (
        <div className="md:hidden fixed right-6 bottom-6 z-50 fab-container">
          <Button
            onClick={() => setIsPaymentDialogOpen(true)}
            className="h-14 w-14 rounded-full shadow-lg single-fab"
            size="icon"
            aria-label="Add Listing"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      ) : user ? (
        <div className="md:hidden fixed right-6 bottom-6 z-50 fab-container">
          <Button
            disabled
            className="h-14 w-14 rounded-full shadow-lg bg-muted single-fab"
            size="icon"
            aria-label="Account Blocked"
          >
            <Plus className="h-6 w-6 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <div className="md:hidden fixed right-6 bottom-6 z-50 fab-container">
          <Link href="/auth">
            <Button
              className="h-14 w-14 rounded-full shadow-lg single-fab"
              size="icon"
              aria-label="Login to Add Listing"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}