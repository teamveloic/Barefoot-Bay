import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageContent, VendorCategory } from "@shared/schema";
import { usePermissions } from "@/hooks/use-permissions";

export const AllVendorsPage: React.FC = () => {
  // State to store organized vendors by category
  const [vendorsByCategory, setVendorsByCategory] = useState<Record<string, PageContent[]>>({});
  // Get user permissions
  const { isAdmin } = usePermissions();
  
  // Fetch all pages to find all vendors
  const { data: allPages, isLoading: isLoadingPages } = useQuery<PageContent[]>({
    queryKey: ['/api/pages'],
    queryFn: async () => {
      // Fetch pages with includeHidden parameter for admins
      const url = isAdmin 
        ? '/api/pages?includeHidden=true' 
        : '/api/pages';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch pages');
      return res.json();
    }
  });
  
  // Fetch vendor categories from database
  const { data: dbCategories, isLoading: isLoadingCategories } = useQuery<VendorCategory[]>({
    queryKey: ['/api/vendor-categories'],
    queryFn: async () => {
      // Fetch categories with includeHidden parameter for admins
      const url = isAdmin 
        ? '/api/vendor-categories?includeHidden=true' 
        : '/api/vendor-categories';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch vendor categories');
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Format categories to match our interface
  const vendorCategories = dbCategories?.map(cat => ({
    id: cat.slug,
    label: cat.name
  })) || [];

  // Process vendor pages and organize them by category
  useEffect(() => {
    if (!allPages || !dbCategories || dbCategories.length === 0) return;

    // Ensure allPages is an array before filtering
    if (!Array.isArray(allPages)) {
      console.error("Expected allPages to be an array, but got:", typeof allPages);
      return;
    }

    // Get all pages that start with vendors-
    // For non-admin users, filter out hidden vendors
    const vendorPages = allPages.filter(page => {
      // Only include vendor pages
      const isVendorPage = page.slug.startsWith('vendors-');
      
      // For admin users, show all vendors (including hidden ones)
      // For non-admin users, filter out hidden vendors
      return isVendorPage && (isAdmin || !page.isHidden);
    });
    console.log("Processing vendor pages:", vendorPages.map(p => p.slug));
    
    // Initialize the organized vendors object
    const organizedVendors: Record<string, PageContent[]> = {};
    
    // Initialize each category with an empty array
    // Filter out hidden categories for non-admin users
    dbCategories
      .filter(category => isAdmin || !category.isHidden)
      .forEach(category => {
        organizedVendors[category.slug] = [];
      });

    // Loop through each vendor page and categorize it
    vendorPages.forEach(page => {
      const slug = page.slug;
      
      // Skip vendor main/index pages
      if (slug === 'vendors-main' || slug === 'vendors') {
        return;
      }
      
      // For vendor slugs, extract the category part
      let vendorCategoryPart = '';
      
      if (slug.includes(' ')) {
        // For slugs with spaces like "vendors-landscaping tst vendor"
        vendorCategoryPart = slug.substring('vendors-'.length, slug.indexOf(' '));
      } else {
        // For slugs with dashes like "vendors-landscaping-company-name" or "vendors-home-services-company-name"
        const slugParts = slug.split('-');
        if (slugParts.length >= 3 && slugParts[0] === 'vendors') {
          // Check for categories with compound slugs (e.g., home-services, food-dining, pressure-washing, etc.)
          const possibleCategorySlug1 = slugParts[1]; // single word category: "home"
          const possibleCategorySlug2 = `${slugParts[1]}-${slugParts[2]}`; // double word category: "home-services"
          
          // First check if this matches any of our vendor categories from the database
          const matchingCompoundCategory = dbCategories.find(cat => 
            cat.slug === possibleCategorySlug2
          );
          
          // If we have a matching compound category in the database, use that
          if (matchingCompoundCategory) {
            vendorCategoryPart = matchingCompoundCategory.slug;
            console.log(`Found matching compound category ${vendorCategoryPart} for vendor ${slug} from database`);
          }
          // Check against known compound categories as fallback
          else if (
            possibleCategorySlug2 === 'home-services' || 
            possibleCategorySlug2 === 'food-dining' || 
            possibleCategorySlug2 === 'professional-services' ||
            possibleCategorySlug2 === 'pressure-washing'
          ) {
            vendorCategoryPart = possibleCategorySlug2;
            console.log(`Found compound category ${vendorCategoryPart} for vendor ${slug} from hardcoded list`);
          } else {
            // Otherwise fallback to single word category
            vendorCategoryPart = possibleCategorySlug1;
          }
        } else {
          return; // Skip invalid vendor slugs
        }
      }
      
      // Check against each category
      dbCategories.forEach(category => {
        // Skip hidden categories for non-admin users
        if (!isAdmin && category.isHidden) {
          return;
        }
        
        const categoryId = category.slug;
        
        // Check if this vendor belongs to the current category
        if (
            // Direct match (e.g., vendors-landscaping-abc matches landscaping category)
            vendorCategoryPart === categoryId ||
            
            // Dynamic check: Does the vendor slug directly contain this category?
            slug.includes(`-${categoryId}-`) ||
            
            // Dynamic check: For vendors created with the category pattern like "vendors-pressure-washing-pressure-test"
            // This will ensure that "pressure-washing" vendors appear under the "pressure-washing" category
            (slug.startsWith(`vendors-${categoryId}-`)) ||
            
            // Handle special cases and partial matches
            (categoryId === 'home-services' && vendorCategoryPart === 'home-service') ||
            (categoryId === 'home-services' && vendorCategoryPart === 'homeservices') ||
            (categoryId === 'food-dining' && (vendorCategoryPart === 'food' || vendorCategoryPart === 'dining')) ||
            (categoryId === 'professional-services' && vendorCategoryPart === 'professional')
        ) {
          console.log(`Adding vendor ${slug} to category ${categoryId}`);
          organizedVendors[categoryId].push(page);
        }
      });
    });
    
    console.log("Organized vendors by category:", Object.keys(organizedVendors).map(cat => 
      `${cat}: ${organizedVendors[cat].length} vendors`
    ));
    
    setVendorsByCategory(organizedVendors);
  }, [allPages, dbCategories, isAdmin]);

  // Display loading state while fetching data
  if (isLoadingPages || isLoadingCategories) {
    return (
      <div className="space-y-6">
        {/* Category Navigation Skeleton */}
        <div className="overflow-x-auto pb-2">
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map((_, i) => (
              <Skeleton key={i} className="h-10 w-24" />
            ))}
          </div>
        </div>
        
        {/* First Table Category Skeleton */}
        <div className="rounded-md border bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-9 w-24" />
          </div>
          
          <div className="hidden md:grid md:grid-cols-12 px-4 py-2 border-b">
            <Skeleton className="h-5 w-16 md:col-span-3" />
            <Skeleton className="h-5 w-24 md:col-span-7" />
            <div className="md:col-span-2 text-right">
              <Skeleton className="h-5 w-16 ml-auto" />
            </div>
          </div>
          
          <div className="divide-y">
            {[1, 2, 3, 4].map((_, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 px-4 py-3 items-center">
                <div className="md:col-span-3 mb-1 md:mb-0">
                  <Skeleton className="h-6 w-32" />
                </div>
                <div className="md:col-span-7 mb-2 md:mb-0">
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="md:col-span-2 text-right">
                  <Skeleton className="h-9 w-24 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Second Table Category Skeleton */}
        <div className="rounded-md border bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-9 w-24" />
          </div>
          
          <div className="hidden md:grid md:grid-cols-12 px-4 py-2 border-b">
            <Skeleton className="h-5 w-16 md:col-span-3" />
            <Skeleton className="h-5 w-24 md:col-span-7" />
            <div className="md:col-span-2 text-right">
              <Skeleton className="h-5 w-16 ml-auto" />
            </div>
          </div>
          
          <div className="divide-y">
            {[1, 2, 3].map((_, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 px-4 py-3 items-center">
                <div className="md:col-span-3 mb-1 md:mb-0">
                  <Skeleton className="h-6 w-32" />
                </div>
                <div className="md:col-span-7 mb-2 md:mb-0">
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="md:col-span-2 text-right">
                  <Skeleton className="h-9 w-24 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  // If categories loaded but no vendors found
  if (!vendorCategories || vendorCategories.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-gray-500">
          <p>No vendor categories available. Please check back later.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Navigation Section */}
      <div className="overflow-x-auto pb-2">
        <div className="flex space-x-2">
          {vendorCategories.map(category => (
            <Link key={category.id} href={`/vendors/${category.id}`}>
              <Button variant="outline" className="whitespace-nowrap">
                {category.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {/* Table-based View of Vendors (Improved) */}
      {vendorCategories.map(category => {
        const vendors = vendorsByCategory[category.id] || [];
        return vendors.length > 0 ? (
          <div key={category.id} className="rounded-md border shadow-sm overflow-hidden bg-white">
            {/* Category Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">{category.label}</h2>
              <Link href={`/vendors/${category.id}`}>
                <Button variant="outline" size="sm">View All {category.label}</Button>
              </Link>
            </div>

            {/* Table Structure */}
            <div className="w-full">
              {/* Table Header */}
              <div className="hidden md:flex w-full text-left border-b bg-gray-50">
                <div className="w-3/12 px-4 py-2 font-medium text-slate-500">Name</div>
                <div className="w-7/12 px-4 py-2 font-medium text-slate-500">Description</div>
                <div className="w-2/12 px-4 py-2 text-right font-medium text-slate-500">Actions</div>
              </div>
              
              {/* Table Body */}
              <div className="divide-y divide-gray-200">
                {vendors.map(vendor => {
                  // Extract vendor name from slug, handling both dash-separated and space formats
                  let vendorName;
                  
                  // Special case for our problem vendors
                  if (vendor.slug === 'vendors-landscaping-tst vendor') {
                    // For this specific vendor with the known issue, preserve the original name
                    // This is critical - use the exact "tst vendor" with space to match what's in the URL
                    vendorName = 'tst vendor';
                    console.log(`Special case for problematic vendor: ${vendor.slug} → vendorName: ${vendorName}`);
                  }
                  // Handle the specific Test vendor case
                  else if (vendor.slug === 'vendors-landscaping-landscaping') {
                    // Make sure we use the dash format for the "landscaping" vendor created with "Test"
                    vendorName = 'landscaping';
                    console.log(`Special case for Test vendor: ${vendor.slug} → vendorName: ${vendorName}`);
                  }
                  else if (vendor.slug.includes(' ')) {
                    // Handle slugs with spaces (e.g., "vendors-landscaping tst vendor")
                    // Extract everything after the category
                    const spaceIndex = vendor.slug.indexOf(' ');
                    vendorName = vendor.slug.substring(spaceIndex + 1);
                    
                    // Keep spaces in the URL for consistency with how it's stored in the database
                  } else {
                    // Handle normal dash-separated slugs (e.g., "vendors-landscaping-test-vendor")
                    const slugParts = vendor.slug.split('-');
                    vendorName = slugParts.slice(2).join('-');
                  }
                  
                  // Format the vendor name for display
                  const vendorDisplayName = vendorName
                    .split(/[-\s]/) // Split by both dashes and spaces
                    .map(word => word && word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                  return (
                    <div key={vendor.slug} className="flex flex-col md:flex-row hover:bg-gray-50 transition-colors">
                      {/* Mobile header (shown only on small screens) */}
                      <div className="md:hidden px-4 pt-3 font-semibold text-slate-800">
                        {vendor.title || vendorDisplayName}
                      </div>
                      
                      {/* Vendor Name (hidden on mobile, shown on desktop) */}
                      <div className="hidden md:block w-3/12 px-4 py-3 font-medium text-slate-800">
                        {vendor.title || vendorDisplayName}
                      </div>
                      
                      {/* Description */}
                      <div className="md:w-7/12 px-4 py-2 md:py-3 text-sm text-slate-600">
                        {vendor.content ? (
                          <div className="line-clamp-2" dangerouslySetInnerHTML={{ 
                            __html: vendor.content.replace(/<[^>]*>/g, ' ').substring(0, 200) + '...'
                          }} />
                        ) : (
                          <span className="text-slate-400 italic">No description available</span>
                        )}
                      </div>
                      
                      {/* Action Button */}
                      <div className="md:w-2/12 px-4 pb-3 md:py-3 md:text-right">
                        <Link href={`/vendors/${category.id}/${encodeURIComponent(vendorName)}`}>
                          <Button variant="outline" size="sm" className="w-full md:w-auto">View Details</Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null;
      })}

      {/* Show message if no vendors available in any category */}
      {vendorCategories.every(category => (vendorsByCategory[category.id] || []).length === 0) && (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>No vendors are currently available. Please check back later.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};