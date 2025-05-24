# Draft-to-Publish Workflow Implementation for Real Estate Listings

## Current Problem Analysis

The current implementation allows for saving listings as drafts, but it appears users are still required to pay before creating a listing, rather than being able to create drafts without payment and publish them later. Key issues identified:

1. The frontend "Save as Draft" button exists in the create-listing-form.tsx file, but the current flow may not correctly bypass the payment requirement when saving a draft.
2. The backend has the necessary endpoint `/api/listings/:id/publish` for publishing draft listings, but the frontend implementation for triggering this process may be incomplete.
3. The ListingCard component displays status badges correctly, but may not properly handle the publish action for draft listings.
4. The For Sale page has the status filter functionality, but it may not be correctly connected to the backend filtering.

## Implementation Plan

### 1. Fix POST /api/listings Endpoint (Server-side)

The core issue is that the current POST /api/listings endpoint requires a payment ID even for draft listings. We need to modify this endpoint to allow creation of draft listings without payment.

**File:** `server/routes.ts`
**Changes:**
- Modify the POST /api/listings endpoint to skip payment verification when the listing status is "DRAFT"
- Only require payment for active listings

```javascript
// POST /api/listings
app.post("/api/listings", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  // Check if user is blocked
  if (req.user.isBlocked) {
    return res.status(403).json({ 
      message: "Your account has been blocked. You cannot create listings.", 
      blocked: true 
    });
  }
  
  try {
    const { listingData, paymentId } = req.body;
    
    // Parse the JSON data from the form data
    let parsedListingData;
    try {
      parsedListingData = typeof listingData === 'string' ? JSON.parse(listingData) : listingData;
    } catch (error) {
      console.error("Error parsing listing data string:", error);
      parsedListingData = listingData;
    }
    
    // Check if this is intended to be a draft listing
    const isDraft = parsedListingData.status === "DRAFT";
    
    // Only require payment for non-draft listings
    if (!isDraft && !paymentId) {
      return res.status(400).json({ 
        success: false, 
        message: "Payment is required to publish a listing. Please complete payment first or save as draft."
      });
    }
    
    // If it's not a draft, verify the payment
    let paymentVerificationOk = true;
    let paymentVerificationWarning = null;
    
    if (!isDraft && paymentId) {
      // Payment verification logic (existing code)...
    }
    
    // Rest of the endpoint remains the same...
    
    // Create the listing with the correct status
    const listing = await storage.createListing({
      ...validatedListingData,
      createdBy: req.user.id,
      // Ensure status is set correctly based on isDraft
      status: isDraft ? "DRAFT" : "ACTIVE",
      // Set expiration date for active listings only
      expirationDate: !isDraft ? (validatedListingData.expirationDate || defaultExpirationDate) : null,
      // Other fields remain the same
    });
    
    // Return response...
  } catch (error) {
    // Error handling...
  }
});
```

### 2. Update Create Listing Form (Client-side)

**File:** `client/src/components/for-sale/create-listing-form.tsx`
**Changes:**
- Modify the handleSubmit function to properly handle draft listings
- Ensure the "Save as Draft" button correctly sets the isDraft flag

```typescript
// Existing handleSubmit function with modifications
const handleSubmit = (data: ListingFormValues, isDraft: boolean = false) => {
  console.log("Form submission triggered with data:", data);
  console.log("Saving as draft:", isDraft);
  
  // Ensure all numeric fields are properly typed
  const formattedData: ListingFormValues = {
    ...data,
    price: Number(data.price),
    bedrooms: Number(data.bedrooms),
    bathrooms: Number(data.bathrooms),
    squareFeet: Number(data.squareFeet),
    yearBuilt: Number(data.yearBuilt),
    contactInfo: {
      name: data.contactInfo?.name?.trim() || "",
      phone: data.contactInfo?.phone?.trim() || "",
      email: data.contactInfo?.email?.trim() || "",
    },
    // Use currentPhotos instead of data.photos to reflect deletions
    photos: currentPhotos,
    // Include the selected files
    mediaFiles: selectedFiles,
    // Ensure ListingType is properly typed
    listingType: data.listingType as ListingType,
    // Set default isSubscription to false if not provided
    isSubscription: data.isSubscription || false,
    // Ensure category is included
    category: data.category || "",
    // Include the listing duration
    listingDuration: listingDuration || undefined,
    // Set status based on whether this is a draft
    status: isDraft ? "DRAFT" : "ACTIVE",
    
    // Ensure expirationDate is always a Date object for non-drafts
    expirationDate: !isDraft && data.expirationDate instanceof Date 
      ? data.expirationDate 
      : !isDraft && typeof data.expirationDate === 'string' 
        ? new Date(data.expirationDate) 
        : null,
  };
  
  // If we're saving as draft, don't need expiration date or payment
  if (isDraft) {
    console.log("Saving as draft, bypassing payment requirement");
  } else {
    // Calculate expiration date for non-drafts if needed
    // (existing code)
  }
  
  // Pass to parent onSubmit with the isDraft flag
  onSubmit({ ...formattedData, status: isDraft ? "DRAFT" : "ACTIVE" });
};
```

### 3. Update For Sale Page (Client-side)

**File:** `client/src/pages/for-sale-page.tsx`
**Changes:**
- Modify the createListing mutation to handle draft vs. published listings differently
- Update the payment handling to skip payment for draft listings
- Ensure filtering by status works correctly

```typescript
// Modify the createListing mutation
const createListingMutation = useMutation({
  mutationFn: async (data: { listingData: any, paymentId?: number | null }) => {
    const { listingData, paymentId } = data;
    
    // Check if this is a draft listing
    const isDraft = listingData.status === "DRAFT";
    
    // Prepare the request payload
    let payload;
    if (isDraft) {
      // For drafts, don't include payment information
      payload = { listingData: JSON.stringify(listingData) };
    } else {
      // For published listings, include payment information
      payload = { 
        listingData: JSON.stringify(listingData),
        paymentId: paymentId
      };
    }
    
    console.log("Creating listing with payload:", payload);
    const res = await apiRequest("POST", "/api/listings", payload);
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error("Server validation errors:", JSON.stringify(errorData, null, 2));
      throw new Error(errorData.message || "Failed to create listing");
    }
    
    return await res.json();
  },
  // ...rest of the mutation configuration
});

// Modify the handleCreateListingSubmit function
const handleCreateListingSubmit = async (data: any) => {
  try {
    // Check if this is a draft listing
    const isDraft = data.status === "DRAFT";
    
    if (isDraft) {
      // For drafts, skip payment
      await createListingMutation.mutateAsync({
        listingData: data
      });
      
      // Show success toast for draft
      toast({
        title: "Success",
        description: "Your listing has been saved as a draft. You can publish it later.",
      });
      
      // Close dialog and reset state
      setIsDialogOpen(false);
      setSelectedFiles([]);
    } else {
      // For published listings, handle payment as before
      // Existing payment flow...
    }
  } catch (error) {
    // Error handling...
  }
};
```

### 4. Update Listing Card Component (Client-side)

**File:** `client/src/components/for-sale/listing-card.tsx`
**Changes:**
- Ensure the publish button is properly displayed for draft listings
- Connect the publish action to the handlePublishListing function

```typescript
// In ListingCard component
export function ListingCard({ 
  listing,
  onClick,
  onDelete,
  onPublish,
  ...rest
}: ListingCardProps) {
  // Component logic...
  
  return (
    <Card {...rest}>
      <CardContent className="p-0">
        {/* Existing card content... */}
        
        {/* Status badges */}
        {listing.status && (
          <div className="absolute top-2 right-2 z-10">
            <Badge
              className={cn(
                "font-normal text-xs",
                listing.status === "DRAFT" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                listing.status === "ACTIVE" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                listing.status === "EXPIRED" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                "bg-gray-100 text-gray-800 hover:bg-gray-100"
              )}
            >
              {listing.status}
            </Badge>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="p-4">
          {/* Publish button for draft listings */}
          {listing.status === "DRAFT" && onPublish && (
            <Button 
              onClick={() => onPublish(listing.id)} 
              className="w-full mb-2 bg-green-600 hover:bg-green-700"
            >
              Publish Listing
            </Button>
          )}
          
          {/* Renew button for expired listings */}
          {listing.status === "EXPIRED" && onPublish && (
            <Button 
              onClick={() => onPublish(listing.id)} 
              className="w-full mb-2 bg-blue-600 hover:bg-blue-700"
            >
              Renew Listing
            </Button>
          )}
          
          {/* Delete button if provided */}
          {onDelete && (
            <Button 
              onClick={() => onDelete(listing.id)} 
              variant="outline" 
              className="w-full mb-2 text-red-600 border-red-300 hover:bg-red-50"
            >
              Delete
            </Button>
          )}
          
          {/* View listing button */}
          {onClick ? (
            <Button className="w-full" onClick={onClick}>View Listing</Button>
          ) : (
            <Link href={`/for-sale/${listing.id}`}>
              <Button className="w-full">View Listing</Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 5. Update the API Endpoint for Publishing Drafts (Server-side)

**File:** `server/routes.ts`
**Changes:**
- Ensure the POST /api/listings/:id/publish endpoint correctly handles the paymentId parameter
- Fix any issues with the payment verification process

```javascript
// Modify the publish endpoint
app.post("/api/listings/:id/publish", async (req, res) => {
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
  const { duration, paymentIntentId, subscriptionId, paymentId } = req.body;
  
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
    
    // Allow admin users to publish without payment
    if (!paymentIntentId && !subscriptionId && !paymentId && req.user.role !== 'admin') {
      return res.status(400).json({ message: "Payment information is required" });
    }
    
    // Create a payment record if payment ID was provided
    if (paymentId) {
      // Get the payment record to verify it exists and isn't already used
      const payment = await storage.getListingPayment(paymentId);
      if (!payment) {
        return res.status(400).json({ message: "Invalid payment ID" });
      }
      
      if (payment.listingId && payment.listingId !== listingId) {
        return res.status(400).json({ message: "This payment has already been used for another listing" });
      }
      
      // Associate the payment with this listing
      await storage.updateListingPayment(paymentId, { 
        listingId, 
        status: "completed" 
      });
    }
    
    // Create a payment record if payment intent ID was provided
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
```

### 6. Ensure the Storage API Correctly Handles Status Changes (Server-side)

**File:** `server/storage.ts`
**Changes:**
- Verify that the publishListing function correctly changes the status from DRAFT to ACTIVE
- Ensure that expirationDate is properly set when publishing

```typescript
async publishListing(id: number, duration: string, subscriptionId?: string): Promise<RealEstateListing> {
  console.log(`Publishing listing ${id} with duration ${duration}`);
  try {
    // Calculate expiration date based on the duration
    const expirationDate = new Date();
    if (duration === '3_day' || duration === '3' || duration === '3day') {
      expirationDate.setDate(expirationDate.getDate() + 3);
    } else if (duration === '7_day' || duration === '7' || duration === '7day') {
      expirationDate.setDate(expirationDate.getDate() + 7);
    } else if (duration === '30_day' || duration === '30' || duration === '30day') {
      expirationDate.setDate(expirationDate.getDate() + 30);
    } else {
      // Default to 30 days if duration is not recognized
      expirationDate.setDate(expirationDate.getDate() + 30);
    }
    
    // Normalize the duration for storage
    let normalizedDuration = duration;
    if (duration === '3' || duration === '3day') normalizedDuration = '3_day';
    if (duration === '7' || duration === '7day') normalizedDuration = '7_day';
    if (duration === '30' || duration === '30day') normalizedDuration = '30_day';
    
    // Update the listing with new status and expiration
    const [updated] = await db.update(realEstateListings)
      .set({
        status: "ACTIVE",
        expirationDate,
        listingDuration: normalizedDuration,
        isSubscription: !!subscriptionId,
        subscriptionId: subscriptionId || null,
        updatedAt: new Date()
      })
      .where(eq(realEstateListings.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to publish listing");
    }

    console.log("Listing published successfully:", updated);
    return updated;
  } catch (error) {
    console.error("Error publishing listing:", error);
    throw error;
  }
}
```

## Implementation Steps

1. Modify the `POST /api/listings` endpoint to allow creation of draft listings without payment
2. Update the create-listing-form component to handle draft vs. published listings correctly
3. Update the for-sale-page to handle filtering by listing status
4. Enhance the listing-card component to properly display actions based on listing status
5. Ensure the publish endpoint correctly handles payment verification
6. Test the entire workflow from draft creation to publishing

## Testing Plan

1. **Create Draft Listing Test**
   - Create a new listing
   - Click "Save as Draft"
   - Verify draft is created without payment
   - Check draft appears in My Listings with DRAFT status

2. **Publish Draft Test**
   - Go to My Listings
   - Find a draft listing
   - Click "Publish"
   - Complete payment process
   - Verify listing status changes to ACTIVE

3. **Status Filtering Test**
   - Create multiple listings with different statuses
   - Use the status filter to show only DRAFT listings
   - Verify only draft listings are displayed
   - Change filter to ACTIVE and verify only active listings are shown

4. **Permission Test**
   - Attempt to publish someone else's draft listing
   - Verify permission is denied
   - As admin, attempt to publish a user's draft
   - Verify admin can publish without payment

5. **Renew Expired Listing Test**
   - Find an expired listing
   - Click "Renew" button
   - Complete payment process
   - Verify listing is renewed with ACTIVE status and new expiration date