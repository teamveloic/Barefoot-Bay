import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationPickerAlt } from "@/components/calendar/location-picker-alt";
import { HoursOperationPicker } from "@/components/calendar/hours-operation-picker";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { z } from "zod";
import { X } from "lucide-react";

// For debugging purposes
window.addEventListener('submit', (e) => {
  console.log('Form submission event captured:', e);
});

// Define recurrence frequency types for frontend
const RecurrenceFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

// Update the schema to include recurring event fields
const eventFormSchema = z.object({
  // Required fields - no changes
  title: z.string().min(1, "Event title is required"),
  startDate: z.date(),
  endDate: z.date(),
  location: z.string().min(1, "Location is required"),
  category: z.enum(["entertainment", "government", "social"]),

  // Optional fields
  description: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  badgeRequired: z.boolean().default(true), // Whether a membership badge is required (default to true)
  contactInfo: z.object({
    name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    website: z.string().optional().nullable()
  }).optional().default({}),
  hoursOfOperation: z.string().optional().nullable(), // Change to string for the JSON
  mediaUrls: z.array(z.string()).optional(),
  existingMediaToRemove: z.array(z.string()).optional(),
  
  // Recurring event fields
  isRecurring: z.boolean().default(false),
  recurrenceFrequency: z.enum([
    RecurrenceFrequency.DAILY,
    RecurrenceFrequency.WEEKLY,
    RecurrenceFrequency.BIWEEKLY,
    RecurrenceFrequency.MONTHLY,
    RecurrenceFrequency.YEARLY
  ]).optional(),
  recurrenceEndDate: z.date().optional(),
}).refine((data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  return endDate > startDate;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
}).refine((data) => {
  // If it's a recurring event, frequency and end date are required
  if (data.isRecurring) {
    return !!data.recurrenceFrequency && !!data.recurrenceEndDate;
  }
  return true;
}, {
  message: "Recurring events must have a frequency and end date",
  path: ["recurrenceEndDate"],
});

export type EventFormData = z.infer<typeof eventFormSchema>;

const defaultHours = {
  Monday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Tuesday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Wednesday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Thursday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Friday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Saturday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Sunday: { isOpen: true, openTime: "09:00", closeTime: "17:00" }
};

type Props = {
  defaultValues?: Partial<EventFormData>;
  onSubmit: (data: EventFormData & { mediaFiles?: FileList | null }) => void;
  onDuplicate?: () => void; // Optional callback for duplicating an event
  isSubmitting?: boolean;
  isDuplicating?: boolean; // Flag to indicate if a duplication process is in progress
};

export function CreateEventForm({ defaultValues, onSubmit, onDuplicate, isSubmitting, isDuplicating }: Props) {
  const [existingMediaToRemove, setExistingMediaToRemove] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: null,
      location: "",
      startDate: new Date(),
      endDate: new Date(),
      category: "entertainment",
      businessName: null,
      badgeRequired: true, // Default to true - most events require a badge
      contactInfo: {
        name: null,
        phone: null,
        email: null,
        website: null
      },
      hoursOfOperation: undefined,
      mediaUrls: [],
      existingMediaToRemove: [],
      isRecurring: false,
      recurrenceFrequency: undefined,
      recurrenceEndDate: undefined,
      ...defaultValues
    }
  });
  
  // Initialize the existingMediaToRemove state with the form's value
  useEffect(() => {
    const formMediaToRemove = form.getValues().existingMediaToRemove || [];
    setExistingMediaToRemove(formMediaToRemove);
    console.log("Initialized existingMediaToRemove:", formMediaToRemove);
  }, []);
  
  // Reset existingMediaToRemove when default values change (e.g., when a different event is loaded)
  useEffect(() => {
    if (defaultValues) {
      setExistingMediaToRemove([]);
      // Also update the form value
      form.setValue('existingMediaToRemove', []);
      console.log("Reset existingMediaToRemove due to defaultValues change");
    }
  }, [defaultValues, form]);
  
  // Initialize with the defaultValues to ensure they're loaded properly
  useEffect(() => {
    if (defaultValues?.mediaUrls) {
      form.setValue('mediaUrls', defaultValues.mediaUrls);
    }
  }, [defaultValues, form]);

  const handleSubmit = async (data: EventFormData) => {
    console.log("Create event form handleSubmit called with data:", data);
    
    // Force update existingMediaToRemove in the form data
    form.setValue('existingMediaToRemove', existingMediaToRemove);
    
    // Create a properly typed contact info object - making sure it matches the expected schema
    const cleanContactInfo = data.contactInfo ? {
      name: data.contactInfo.name?.trim() || null,
      phone: data.contactInfo.phone?.trim() || null,
      email: data.contactInfo.email?.trim() || null,
      website: data.contactInfo.website?.trim() || null
    } : undefined;

    // Enhanced debugging for media handling
    console.log("Media URLs in form:", data.mediaUrls);
    console.log("Media files selected:", selectedFiles ? selectedFiles.length : 0);
    console.log("Media to remove from state var:", existingMediaToRemove);
    console.log("Media to remove from form data:", form.getValues().existingMediaToRemove);
    
    // Re-get the form values after the forced update
    const updatedFormValues = form.getValues();

    // Sanitize all data including recurring event fields
    const sanitizedData = {
      ...updatedFormValues, // Use the updated form values that include the forced existingMediaToRemove update
      title: data.title.trim(),
      location: data.location.trim(),
      description: data.description?.trim() || undefined,
      businessName: data.businessName?.trim() || undefined,
      badgeRequired: data.badgeRequired ?? true, // Default to true if not explicitly set
      contactInfo: Object.keys(cleanContactInfo || {}).length > 0 ? cleanContactInfo : undefined,
      // Handle the hours of operation properly - critical for toggle state persistence
      hoursOfOperation: !data.hoursOfOperation || data.hoursOfOperation === '' ? 
        null : // Empty or undefined value
        (data.hoursOfOperation ? 
          JSON.parse(data.hoursOfOperation) : null),
      // Recurring event fields - properly handle null values for server
      isRecurring: data.isRecurring || false,
      recurrenceFrequency: data.isRecurring ? data.recurrenceFrequency : null,
      recurrenceEndDate: data.isRecurring && data.recurrenceEndDate ? 
        data.recurrenceEndDate : null,
      // Media fields - critical for proper media handling
      mediaUrls: data.mediaUrls || [],
      // Use the state variable directly to ensure the latest value is used
      existingMediaToRemove: existingMediaToRemove,
      mediaFiles: selectedFiles
    };

    console.log("Submitting event with sanitized data:", sanitizedData);
    
    // Call the onSubmit prop function
    try {
      onSubmit(sanitizedData);
      console.log("onSubmit called successfully");
    } catch (error) {
      console.error("Error in onSubmit:", error);
    }
  };

  return (
    <Form {...form}>
      <form 
        onSubmit={(e) => {
          console.log("Raw form submit event triggered");
          e.preventDefault(); // Prevent default form submission
          
          // Get the current form values
          const formValues = form.getValues();
          console.log("Form values from getValues:", formValues);
          
          // Call our form submission handler directly
          handleSubmit(formValues);
        }} 
        className="space-y-8">
        {/* Required Fields Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-semibold">Event Information</h3>
            
            {/* Duplicate button at the top of the form */}
            {defaultValues && onDuplicate && (
              <Button
                type="button"
                variant="outline"
                disabled={isDuplicating}
                className="min-w-[100px]"
                onClick={() => {
                  console.log("Duplicate button clicked");
                  if (onDuplicate) onDuplicate();
                }}
              >
                {isDuplicating ? "Duplicating..." : "Duplicate Event"}
              </Button>
            )}
          </div>

          {/* Event Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Event Title</FormLabel>
                <FormControl>
                  <Input placeholder="Enter event title" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Date and Time Fields */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Start Date & Time</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={format(field.value, "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">End Date & Time</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={format(field.value, "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Location Field */}
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Location</FormLabel>
                <FormControl>
                  <LocationPickerAlt
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                    }}
                    placeholder="Enter address or business name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category Field */}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                    <SelectItem value="government">Government</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Optional Section */}
          <div className="border-t pt-6">
            <h3 className="text-xl font-semibold mb-4">Optional Information</h3>
          </div>

          {/* Description Field */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter event description"
                    className="min-h-[100px]"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Business Name */}
          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business/Amenity Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter business or amenity name"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Badge Required Toggle */}
          <FormField
            control={form.control}
            name="badgeRequired"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Badge Required?</FormLabel>
                  <FormDescription>
                    Toggle to indicate if a Barefoot Bay membership badge is required for this event
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Contact Information */}
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-medium">Contact Information</h4>
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="contactInfo.name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter contact name"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactInfo.phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(555) 555-5555"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactInfo.email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="contact@example.com"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactInfo.website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://example.com"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Hours of Operation section */}
          <FormField
            control={form.control}
            name="hoursOfOperation"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <HoursOperationPicker
                    value={field.value || ''}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Recurring Event Section */}
          <div className="border-t pt-4">
            <div className="mb-4">
              <h4 className="text-sm font-medium">Recurring Event</h4>
            </div>
            
            {/* Is Recurring Toggle */}
            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Recurring Event</FormLabel>
                    <FormDescription>
                      Set this event to repeat at regular intervals
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            {/* Recurrence Frequency Field - Only shown when isRecurring is true */}
            {form.watch("isRecurring") && (
              <div className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="recurrenceFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repeat Frequency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={RecurrenceFrequency.DAILY}>Daily</SelectItem>
                          <SelectItem value={RecurrenceFrequency.WEEKLY}>Weekly</SelectItem>
                          <SelectItem value={RecurrenceFrequency.BIWEEKLY}>Biweekly</SelectItem>
                          <SelectItem value={RecurrenceFrequency.MONTHLY}>Monthly</SelectItem>
                          <SelectItem value={RecurrenceFrequency.YEARLY}>Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Recurrence End Date Field */}
                <FormField
                  control={form.control}
                  name="recurrenceEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Recurring Events On</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            const date = e.target.value ? new Date(e.target.value) : undefined;
                            field.onChange(date);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>

          {/* Media Upload Section */}
          <FormField
            control={form.control}
            name="mediaUrls"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Photos & Videos</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => {
                      if (e.target.files) {
                        setSelectedFiles(e.target.files);
                        field.onChange([]);
                      }
                    }}
                  />
                </FormControl>
                {field.value && field.value.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">Current Media:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {field.value.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Media ${index + 1}`}
                            className="w-full h-24 object-cover rounded-md"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              console.log(`Marking media for removal: ${url}`);
                              
                              // Add this URL to the list of media to remove
                              const updatedMediaToRemove = [...existingMediaToRemove, url];
                              setExistingMediaToRemove(updatedMediaToRemove);
                              
                              // Update the form's mediaUrls field to reflect the removal
                              const currentMediaUrls = form.getValues().mediaUrls || [];
                              const updatedMediaUrls = currentMediaUrls.filter(u => u !== url);
                              
                              // Update form state for both fields
                              field.onChange(updatedMediaUrls);
                              form.setValue('existingMediaToRemove', updatedMediaToRemove);
                              
                              // Synchronize form value with the state variable
                              setTimeout(() => {
                                const formStateValue = form.getValues().existingMediaToRemove || [];
                                console.log("Form state existingMediaToRemove:", formStateValue);
                                
                                // Ensure they're in sync
                                if (JSON.stringify(formStateValue) !== JSON.stringify(updatedMediaToRemove)) {
                                  console.log("Re-syncing form state with component state");
                                  form.setValue('existingMediaToRemove', updatedMediaToRemove);
                                }
                              }, 0);
                              
                              console.log("Media URLs after removal:", updatedMediaUrls);
                              console.log("Media to remove list:", updatedMediaToRemove);
                              console.log("Form values after update:", form.getValues());
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Submit Button */}
        <div className="pt-6 space-x-2 flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="min-w-[100px]"
            onClick={() => {
              console.log("Submit button clicked directly");
              // This onClick handler is just for logging - the actual submission
              // happens through form.handleSubmit
            }}
          >
            {isSubmitting ? "Saving..." : defaultValues ? "Update Event" : "Create Event"}
          </Button>
        </div>
      </form>
    </Form>
  );
}