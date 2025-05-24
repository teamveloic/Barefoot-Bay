import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from 'zod';
import { Calendar as CalendarIcon, Plus, Trash2, ChevronLeft, ChevronRight, ChevronDown, CreditCard, BanIcon, MapPin, RefreshCw } from "lucide-react";
import { format, addHours, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, addDays, subDays, addWeeks, subWeeks } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useCalendarSync } from "@/hooks/use-calendar-sync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import MobileDayView from "@/components/calendar/mobile-day-view";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EventCard } from "@/components/calendar/event-card";
import { type Event } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LocationPickerAlt } from "@/components/calendar/location-picker-alt";
import { HoursOperationPicker } from "@/components/calendar/hours-operation-picker";
import { usePermissions } from "@/hooks/use-permissions";
import { PhoneInput } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Helper function to strip HTML tags from text
const stripHtmlTags = (html: string | null) => {
  if (!html) return '';
  return html.replace(/<\/?[^>]+(>|$)/g, '');
};

const defaultHours = {
  Monday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Tuesday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Wednesday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Thursday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Friday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Saturday: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  Sunday: { isOpen: true, openTime: "09:00", closeTime: "17:00" }
};

// Define recurrence frequency options for the frontend
const RecurrenceFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

const eventFormSchema = z.object({
  title: z.string().min(1, "Event title is required"),
  description: z.string().min(1, "Description is required"),
  location: z.string().min(1, "Location is required"),
  startDate: z.date(),
  endDate: z.date(),
  category: z.enum(["entertainment", "government", "social"]),
  businessName: z.string().optional(),
  badgeRequired: z.boolean().default(true), // Badge required field with default to true
  contactInfo: z.object({
    name: z.string().optional(),
    phone: z.string()
      .optional()
      .transform(val => val === '' ? undefined : val)
      .pipe(
        z.string()
          .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Phone number must be in format (555) 555-5555")
          .optional()
      ),
    email: z.string().optional()
      .transform(val => val === '' ? undefined : val)
      .pipe(z.string().email("Invalid email address").optional()),
    website: z.string().optional()
      .transform(val => val === '' ? undefined : val)
      .pipe(z.string().url("Invalid website URL").optional())
  }).optional().default({}),
  mediaUrls: z.array(z.string()).optional(),
  hoursOfOperation: z.record(z.object({
    isOpen: z.boolean(),
    openTime: z.string(),
    closeTime: z.string()
  })).optional(),

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
  // Validate that recurrenceEndDate is after startDate for recurring events
  if (data.isRecurring && data.recurrenceEndDate) {
    return new Date(data.recurrenceEndDate) > new Date(data.startDate);
  }
  return true;
}, {
  message: "Recurrence end date must be after the event start date",
  path: ["recurrenceEndDate"],
});

type EventFormData = z.infer<typeof eventFormSchema>;
type ViewType = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const { user } = useAuth();
  const { isAdmin, canCreateEvent, isRegistered } = usePermissions();
  const { toast } = useToast();
  const { refreshCalendarData, isConnected } = useCalendarSync(); // Use the calendar sync hook
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [badgeFilter, setBadgeFilter] = useState<boolean | null>(null); // null = show all, true = badge required, false = no badge required
  // Set initial view type based on screen size - month for desktop, week for mobile
  const [viewType, setViewType] = useState<ViewType>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'week' : 'month');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [, setLocation] = useLocation();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check for mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Switch to Week view only when transitioning from desktop to mobile and view is Month
  useEffect(() => {
    // Only switch to Week view if we just detected mobile mode AND the current view is Month
    if (isMobile && viewType === 'month') {
      setViewType('week');
    }
    // When switching back to desktop, we don't change anything - maintains user selected view
  }, [isMobile]);

  // Add mutation for deleting all events
  const deleteAllEventsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/events', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete all events');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Success",
        description: "All calendar events have been deleted"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      startDate: selectedDate,
      endDate: addHours(selectedDate, 1),
      category: "entertainment",
      businessName: "",
      badgeRequired: true, // Default to true - most events require a badge
      contactInfo: {
        name: "",
        phone: "",
        email: "",
        website: ""
      },
      mediaUrls: [],
      hoursOfOperation: defaultHours,
      // Recurring event defaults
      isRecurring: false,
      recurrenceFrequency: undefined,
      recurrenceEndDate: undefined
    }
  });

  useEffect(() => {
    form.reset({
      ...form.getValues(),
      startDate: selectedDate,
      endDate: addHours(selectedDate, 1)
    });
  }, [selectedDate, form]);

  // Effect to scroll to the selected event when the view loads
  useEffect(() => {
    if (viewType === 'day' && selectedEventId !== null) {
      // Add a slight delay to ensure the DOM is ready
      setTimeout(() => {
        // Use DOM selector to find the selected event
        const selectedElement = document.getElementById(`event-${selectedEventId}`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ 
            behavior: 'smooth',
            block: 'center'  
          });
          // Clear the selected event ID after scrolling
          setSelectedEventId(null);
        }
      }, 100);
    }
  }, [viewType, selectedEventId, setSelectedEventId]);

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const formData = new FormData();

      const cleanContactInfo = data.contactInfo ? Object.fromEntries(
        Object.entries(data.contactInfo).filter(([_, value]) => value && value.trim() !== '')
      ) : undefined;

      const eventData = {
        title: data.title,
        description: data.description,
        location: data.location,
        startDate: format(new Date(data.startDate), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
        endDate: format(new Date(data.endDate), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
        category: data.category,
        badgeRequired: data.badgeRequired, // Include the badge requirement
        // Recurring event fields
        isRecurring: data.isRecurring || false,
        ...(data.isRecurring && data.recurrenceFrequency && { 
          recurrenceFrequency: data.recurrenceFrequency 
        }),
        ...(data.isRecurring && data.recurrenceEndDate && { 
          recurrenceEndDate: format(new Date(data.recurrenceEndDate), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx") 
        }),
        // Other fields
        ...(data.businessName && { businessName: data.businessName }),
        ...(Object.keys(cleanContactInfo || {}).length > 0 && { contactInfo: cleanContactInfo }),
        ...(data.mediaUrls && data.mediaUrls.length > 0 && { mediaUrls: data.mediaUrls }),
        ...(data.hoursOfOperation && { hoursOfOperation: data.hoursOfOperation })
      };

      formData.append('eventData', JSON.stringify(eventData));

      if (selectedFiles.length > 0) {
        selectedFiles.forEach((file) => {
          formData.append('media', file);
        });
      }

      const response = await fetch('/api/events', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setIsDialogOpen(false);
      form.reset();
      setSelectedFiles([]);
      toast({
        title: "Success",
        description: "Event created successfully"
      });
    },
    onError: (error: Error) => {
      console.error("Mutation error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = form.getValues();
      await createEventMutation.mutateAsync(data);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'entertainment':
        return 'bg-[#47759a]';
      case 'government':
        return 'bg-[#e9dfe0]';
      case 'social':
        return 'bg-[#efe59c]';
      default:
        return 'bg-gray-300';
    }
  };

  const getCategoryColorHex = (category: string) => {
    switch (category) {
      case 'entertainment':
        return '#47759a';
      case 'government':
        return '#e9dfe0';
      case 'social':
        return '#efe59c';
      default:
        return '#CBD5E1'; // gray-300 equivalent
    }
  };

  const getTextColor = (category: string) => {
    switch (category) {
      case 'entertainment':
        return 'text-white';
      case 'government':
      case 'social':
        return 'text-navy';
      default:
        return 'text-gray-700';
    }
  };

  const formatEventTime = (date: string | Date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, "h:mm a");
  };

  const getFilteredEvents = (events: Event[]) => {
    // Apply category filter
    let filteredEvents = selectedCategory === "all"
      ? events
      : events.filter(event => event.category === selectedCategory);

    // Apply badge requirement filter if set
    if (badgeFilter !== null) {
      filteredEvents = filteredEvents.filter(event => {
        // Check if event has badgeRequired property and it matches the filter
        return event.badgeRequired === badgeFilter;
      });
    }

    return filteredEvents;
  };

  const getEventsForSelectedDate = () => {
    return getFilteredEvents(events)
      .filter((event) => isSameDay(new Date(event.startDate), selectedDate));
  };

  const getEventsForDay = (date: Date) => {
    return getFilteredEvents(events)
      .filter((event) => isSameDay(new Date(event.startDate), date));
  };

  // Function to handle manual refresh of calendar data
  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshCalendarData();
    // Reset the refresh state after a short delay for UI feedback
    setTimeout(() => {
      setIsRefreshing(false);
    }, 750);
  };

  const renderDayContent = (date: Date) => {
    const dayEvents = getEventsForDay(date);
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    // Use the dedicated mobile component on mobile devices
    if (isMobile) {
      return <MobileDayView date={date} events={dayEvents} />;
    }

    // Desktop view rendering
    const MAX_VISIBLE_EVENTS = 3;
    const displayEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
    const remainingCount = dayEvents.length - MAX_VISIBLE_EVENTS;
    const hasMoreEvents = remainingCount > 0;

    return (
      <div className="h-full w-full flex flex-col" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        {/* Day number */}
        <div className="text-right pr-1 font-semibold text-sm h-5">
          {format(date, "d")}
          {hasMoreEvents && (
            <span className="inline-block ml-1">
              <ChevronDown className="h-3 w-3 inline-block opacity-40" />
            </span>
          )}
        </div>

        {/* Events container with overflow indicator */}
        <div className="flex-1 flex flex-col space-y-1 px-1 relative" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
          {displayEvents.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="mobile-calendar-event overflow-hidden hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0 w-full"
              style={{ 
                width: '100%', 
                maxWidth: '100%', 
                display: 'block',
                backgroundColor: getCategoryColorHex(event.category),
                borderRadius: '4px',
                marginBottom: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {/* Apple-style calendar event - just title in white text over category color */}
              <div className="px-1.5 py-0.5 w-full" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div className="flex items-center justify-between">
                  <span className={`font-medium text-[10px] ${event.category === 'government' || event.category === 'social' ? 'text-navy' : 'text-white'} overflow-hidden text-ellipsis whitespace-nowrap max-w-[calc(100%-30px)]`}>
                    {event.title}
                  </span>
                  <span className={`text-[9px] ${event.category === 'government' || event.category === 'social' ? 'text-navy/90' : 'text-white/90'}`}>
                    {formatEventTime(event.startDate)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {hasMoreEvents && (
            <Link
              href={`/calendar?date=${format(date, 'yyyy-MM-dd')}`}
              className="text-[9px] text-center bg-gray-100 hover:bg-blue-200 text-gray-800 
              rounded px-1 py-0.5 font-medium block hover:text-blue-900 transition-colors group mt-1 relative w-full"
            >
              <span className="block group-hover:hidden">
                +{remainingCount} more
                <ChevronDown className="h-2.5 w-2.5 inline-block ml-1 opacity-50" />
              </span>
              <span className="hidden group-hover:block">See All</span>
            </Link>
          )}
        </div>
      </div>
    );
  };

  // Navigation functions
  const goToPreviousDay = () => {
    setSelectedDate(prevDate => subDays(prevDate, 1));
  };

  const goToNextDay = () => {
    setSelectedDate(prevDate => addDays(prevDate, 1));
  };

  const goToPreviousWeek = () => {
    setSelectedDate(prevDate => subWeeks(prevDate, 1));
  };

  const goToNextWeek = () => {
    setSelectedDate(prevDate => addWeeks(prevDate, 1));
  };

  const renderDailyView = () => {
    const eventsForDay = getEventsForSelectedDate();

    // Sort events chronologically by start time
    const sortedEvents = [...eventsForDay].sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center">
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToPreviousDay}
            aria-label="Previous day"
            className="flex-none"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-base sm:text-xl md:text-2xl font-semibold flex-1 text-center truncate">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToNextDay}
            aria-label="Next day"
            className="flex-none"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Chronological list view */}
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          {sortedEvents.length > 0 ? (
            <ul className="divide-y w-full">
              {sortedEvents.map((event) => {
                const startTime = new Date(event.startDate);
                const endTime = new Date(event.endDate);

                return (
                  <li 
                    key={event.id} 
                    className="p-0 w-full"
                    id={`event-${event.id}`}
                  >
                    <Link 
                      href={`/events/${event.id}`}
                      className="block p-4 hover:bg-slate-50 transition-colors w-full"
                    >
                      <div className="flex flex-wrap sm:flex-nowrap items-start gap-3 w-full">
                        {/* Category indicator */}
                        <div className="w-1.5 self-stretch rounded-full hidden sm:block" 
                          style={{ 
                            backgroundColor: 
                              event.category === 'entertainment' ? '#47759a' : 
                              event.category === 'government' ? '#e9dfe0' : 
                              event.category === 'social' ? '#efe59c' : '#90C9D4'
                          }} 
                        />

                        {/* Time column - adjust for mobile */}
                        <div className="w-full sm:w-20 flex-shrink-0 text-center mb-2 sm:mb-0">
                          <div className="text-sm font-medium">
                            {formatEventTime(startTime)}
                          </div>
                          <div className="text-xs text-gray-500">
                            to {formatEventTime(endTime)}
                          </div>
                        </div>

                        {/* Event details */}
                        <div className="flex-grow min-w-0 w-full sm:w-auto">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 sm:hidden ${getCategoryColor(event.category)}`}></div>
                            <h4 className="font-semibold text-base break-words md:truncate">{event.title}</h4>
                          </div>

                          {event.location && (
                            <div className="text-sm text-gray-600 truncate mt-1">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                {event.location}
                              </span>
                            </div>
                          )}

                          {/* Badge requirement indicator */}
                          <div className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                            {event.badgeRequired ? (
                              <>
                                <CreditCard className="h-3 w-3 text-primary" />
                                <span className="font-medium text-white bg-primary px-1 rounded">Badge Required</span>
                              </>
                            ) : (
                              <>
                                <BanIcon className="h-3 w-3 text-gray-400" />
                                <span>No Badge Required</span>
                              </>
                            )}
                          </div>

                          {event.description && (
                            <div className="text-sm text-gray-600 line-clamp-2 mt-1">
                              {stripHtmlTags(event.description)}
                            </div>
                          )}
                        </div>

                        {/* Category badge - bottom on mobile, right on desktop */}
                        <div className="flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
                          <span 
                            className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${getCategoryColor(event.category)} ${getTextColor(event.category)}`}
                          >
                            {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No events scheduled for this day
            </div>
          )}
        </div>
      </div>
    );
  };

  // We'll use CSS position: sticky instead of JavaScript
  // This effect just adds some debugging info
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Adding debugging info
    const weekNavHeader = document.querySelector('.week-nav-header');
    if (weekNavHeader) {
      const rect = weekNavHeader.getBoundingClientRect();
      weekNavHeader.setAttribute('data-top', rect.top.toString());
      weekNavHeader.setAttribute('data-height', rect.height.toString());
    }
  }, [viewType]);

  const renderWeeklyView = () => {
    const weekStart = startOfWeek(selectedDate);
    const weekEnd = endOfWeek(selectedDate);
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

    // Generate array of hours for the timeline
    const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM to 9 PM

    // Group events by their start time to handle overlaps
    const groupEventsByTime = (events: Event[]) => {
      const groupedEvents: {[key: string]: Event[]} = {};

      events.forEach(event => {
        const startHour = new Date(event.startDate).getHours();
        const startMinRounded = Math.floor(new Date(event.startDate).getMinutes() / 15) * 15;
        const timeKey = `${startHour}:${startMinRounded}`;

        if (!groupedEvents[timeKey]) {
          groupedEvents[timeKey] = [];
        }
        groupedEvents[timeKey].push(event);
      });

      return groupedEvents;
    };

    // Function to calculate position and height based on event time
    const calculateEventPosition = (event: Event, eventIndex: number, totalEvents: number) => {
      const startTime = new Date(event.startDate);
      const endTime = new Date(event.endDate);

      const startHour = startTime.getHours() + startTime.getMinutes() / 60;
      const endHour = endTime.getHours() + endTime.getMinutes() / 60;

      // Calculate top position (distance from top based on start time)
      // Each hour is 100px tall in our timeline
      const topPosition = Math.max(0, (startHour - 7) * 100); // 7 AM is our starting hour

      // Calculate height (based on event duration)
      const height = Math.max(50, (endHour - startHour) * 100); // Minimum height of 50px

      // Calculate width and left position for overlapping events
      let width = '100%';
      let left = 0;

      if (totalEvents > 1) {
        // If there are multiple events at the same time
        const columnWidth = 100 / totalEvents;
        width = `${columnWidth}%`;
        left = eventIndex * columnWidth;
      }

      return { top: topPosition, height, width, left };
    };

    return (
      <div className="space-y-2">
        {/* Week navigation bar that becomes sticky only when scrolling down */}
        <div className="flex items-center justify-between px-2 mb-0 sticky top-[50px] md:top-0 left-0 right-0 bg-white z-40 py-2 border-b shadow-sm week-nav-header">
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToPreviousWeek}
            aria-label="Previous week"
            className="flex-none h-10 w-10 mr-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-base sm:text-xl md:text-2xl font-semibold text-center truncate">
            <span className="hidden sm:inline">Week of </span>
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToNextWeek}
            aria-label="Next week"
            className="flex-none h-10 w-10 ml-1"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Timeline view */}
        <div className="border rounded-lg overflow-x-auto relative -mx-4 md:mx-0 md:overflow-visible">
          {/* Mobile week view indicator - commented out as no longer needed */}
          {/* <div className="md:hidden absolute left-1/2 -translate-x-1/2 top-1 z-30 bg-slate-50/90 text-xs text-gray-500 rounded px-2 py-1 shadow-sm">
            <span>← Swipe →</span>
          </div> */}
          <div className="flex w-full overflow-x-auto" style={{ minWidth: '100%', maxWidth: '100%' }}>
            {/* Time markers column */}
            <div className="w-5 md:w-16 border-r bg-slate-50 relative sticky left-0 z-20">
              {hours.map((hour) => (
                <div key={hour} className="h-[80px] md:h-[100px] border-b flex items-center justify-end pr-1 md:pr-2 text-[10px] md:text-xs text-gray-500 font-medium">
                  <div>
                    <span className="hidden md:inline">{hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}</span>
                    <span className="md:hidden">{hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Days columns */}
            {daysInWeek.map((day) => {
              const eventsForDay = getFilteredEvents(events).filter((event) =>
                isSameDay(new Date(event.startDate), day)
              );

              return (
                <div key={day.toISOString()} className="flex-1 border-r w-[45px] md:w-[80px] relative">
                  {/* Day header - now clickable */}
                  <div 
                    className="h-12 border-b bg-white sticky top-0 z-10 flex flex-col justify-center items-center cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      // When the day header is clicked, set the selected date to this day and switch to day view
                      setSelectedDate(day);
                      setViewType('day');
                    }}
                  >
                    <div className="font-bold text-[10px] md:text-sm">
                      <span className="md:hidden">{format(day, "EEE")}</span>
                      <span className="hidden md:inline">{format(day, "EEEE")}</span>
                    </div>
                    <div className="text-[10px] md:text-sm text-gray-500">{format(day, "MMM d")}</div>
                  </div>

                  {/* Time grid */}
                  <div className="relative">
                    {hours.map((hour) => (
                      <div 
                        key={hour} 
                        className="h-[80px] md:h-[100px] border-b cursor-pointer hover:bg-slate-50"
                        onClick={() => {
                          // When anempty cell is clicked, set the selected date to this day and switch to day view
                          const newDate = new Date(day);
                          newDate.setHours(hour);
                          setSelectedDate(newDate);
                          setViewType('day');
                        }}
                      ></div>
                    ))}

                    {/* Events */}
                    {/* Group events by start time to handle overlaps */}
                    {Object.entries(groupEventsByTime(eventsForDay)).map(([timeKey, events]) => {
                      const eventsArray = events as Event[];
                      return eventsArray.map((event, index) => {
                        const startTime = new Date(event.startDate);
                        const endTime = new Date(event.endDate);

                        const startHour = startTime.getHours() + startTime.getMinutes() / 60;
                        const endHour = endTime.getHours() + endTime.getMinutes() / 60;

                        // Calculate top position (distance from top based on start time)
                        // Adjust for mobile vs desktop heights (80px vs 100px per hour)
                        const hourHeight = typeof window !== 'undefined' && window.innerWidth < 768 ? 80 : 100;
                        const topPosition = Math.max(0, (startHour - 7) * hourHeight);

                        // Calculate height (based on event duration)
                        const height = Math.max(40, (endHour - startHour) * hourHeight); // Smaller minimum height on mobile

                        // Calculate width and position for overlapping events
                        const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;

                        // For mobile with multiple events at the same time,
                        // determine if we should adapt the layout
                        const useMobileAdaptiveLayout = isMobileView && eventsArray.length > 1;

                        // Calculate event width based on number of events and mobile vs desktop
                        const eventWidth = eventsArray.length > 1 
                          ? useMobileAdaptiveLayout
                            ? `${95}%` // Make mobile overlapping events still take up most of the space
                            : `${100 / eventsArray.length}%` 
                          : '100%';

                        // For mobile with multiple events, calculate a vertical offset instead of reducing width
                        const verticalOffset = useMobileAdaptiveLayout ? (index * 5) : 0;

                        // Calculate horizontal position
                        const leftPosition = eventsArray.length > 1 
                          ? useMobileAdaptiveLayout
                            ? 0  // All events aligned to left on mobile
                            : index * (100 / eventsArray.length) 
                          : 0;

                        const eventStart = new Date(event.startDate);

                        // Determine mobile-specific classes
                        const mobileOverlapClass = useMobileAdaptiveLayout ? "mobile-event-overlap" : "";
                        const mobileOverlapIndex = useMobileAdaptiveLayout ? `mobile-event-index-${index}` : "";

                        return (
                          <div
                            key={event.id}
                            onClick={() => {
                              setSelectedDate(new Date(event.startDate));
                              setSelectedEventId(event.id);
                              setViewType('day');
                            }}
                            className={`absolute rounded shadow hover:shadow-md transition-shadow px-2 py-1 overflow-hidden hover:z-30 active:z-30 border ${event.category === 'entertainment' ? 'bg-[#47759a]' : event.category === 'government' ? 'bg-[#e9dfe0]' : event.category === 'social' ? 'bg-[#efe59c]' : 'bg-gray-200'} cursor-pointer ${mobileOverlapClass} ${mobileOverlapIndex}`}
                            style={{ 
                              top: `${topPosition + verticalOffset}px`, 
                              height: `${height}px`,
                              minHeight: '40px',
                              left: `${leftPosition}%`,
                              width: eventWidth,
                              zIndex: useMobileAdaptiveLayout ? index + 1 : 'auto', // Higher z-index for later events
                            }}
                            data-event-title={event.title} // Store event title for tooltip/accessibility
                          >
                            <div className={`font-semibold text-xs break-words md:truncate ${event.category === 'entertainment' ? 'text-white' : 'text-navy'}`}>
                              {/* Always display text horizontally for all events */}
                              <span className="horizontal-only mobile-event-title">{event.title}</span>
                            </div>
                            <div className={`text-[10px] truncate ${event.category === 'entertainment' ? 'text-white/80' : 'text-navy/80'}`}>
                              {formatEventTime(eventStart)}
                              {/* Badge indicator icon */}
                              {event.badgeRequired && 
                                <span className="ml-1 inline-flex items-center">
                                  <CreditCard className="h-2 w-2 inline-block ml-1 text-primary" />
                                </span>
                              }
                            </div>

                            {/* Mobile-only indicator for overlapping events */}
                            {useMobileAdaptiveLayout && (
                              <div className="mobile-event-counter">
                                {index + 1}/{eventsArray.length}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* Function moved to avoid duplicate declaration */

  return (
    <>
      <div className="max-w-7xl space-y-8 relative">
        {/* Header only for desktop - completely hidden on mobile */}
        <div className="hidden md:flex items-start justify-between w-full mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2 text-left">Community Calendar</h1>
            <p className="text-sm text-muted-foreground">Please note: Events may change or be canceled due to weather, illness, or unforeseen circumstances.
            For corrections, updates, photos, or event submissions, email BarefootBayCalendar@gmail.com</p>
          </div>

          {/* Refresh button removed as requested */}
        </div>

        {/* Mobile header - removed per request */}
        <div className="md:hidden">
          {/* Community Calendar header removed from mobile view only */}
          <p className="text-xs text-muted-foreground mb-4">Please note: Events may change or be canceled due to weather, illness, or unforeseen circumstances.
          For corrections, updates, photos, or event submissions, email BarefootBayCalendar@gmail.com</p>
        </div>

        {/* Floating Action Button for desktop */}
        <div className="hidden md:block fixed bottom-8 right-8 z-10">
          {!user && (
            <Link href="/auth">
              <Button size="icon" className="h-16 w-16 rounded-full shadow-lg">
                <Plus className="h-7 w-7" />
              </Button>
            </Link>
          )}

          {user && !canCreateEvent && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" className="h-16 w-16 rounded-full shadow-lg" disabled>
                    <Plus className="h-7 w-7" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="p-3 text-center">
                  <p>Feature access restricted</p>
                  <p className="text-xs mt-1">You don't have permission to create events</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {user && canCreateEvent && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" className="h-16 w-16 rounded-full shadow-lg">
                  <Plus className="h-7 w-7" />
                </Button>
              </DialogTrigger>

            </Dialog>
          )}
        </div>

        {/* Floating Action Button for mobile */}
        <div className="md:hidden fixed bottom-6 right-6 z-10 fab-container">
          {!user && (
            <Link href="/auth">
              <Button size="icon" className="h-14 w-14 rounded-full shadow-md bg-primary single-fab">
                <Plus className="h-6 w-6" />
              </Button>
            </Link>
          )}

          {user && !canCreateEvent && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" className="h-14 w-14 rounded-full shadow-md bg-primary single-fab" disabled>
                    <Plus className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="p-3 text-center">
                  <p>Feature access restricted</p>
                  <p className="text-xs mt-1">You don't have permission to create events</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {user && canCreateEvent && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" className="h-14 w-14 rounded-full shadow-md bg-primary single-fab">
                  <Plus className="h-6 w-6" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[80vh] overflow-y-auto p-2 sm:p-6 max-w-full min-w-0">
                <DialogHeader>
                  <DialogTitle>Create New Event</DialogTitle>
                  <DialogDescription>
                    Add a new event to the community calendar. Fields marked with * are required.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={onSubmit} className="space-y-8 max-w-full">
                    <div className="space-y-6">
                      <h3 className="text-xl font-semibold">Event Information</h3>

                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Event Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter event title"
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
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Description</FormLabel>
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

                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Location</FormLabel>
                            <FormControl>
                              <LocationPickerAlt
                                value={field.value || ""}
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                      {/* Recurring Events Section */}
                      <div className="space-y-4 mt-2">
                        <FormField
                          control={form.control}
                          name="isRecurring"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={field.onChange}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Make this a recurring event</FormLabel>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {form.watch("isRecurring") && (
                          <div className="space-y-4 ml-6">
                            <FormField
                              control={form.control}
                              name="recurrenceFrequency"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">Frequency</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select frequency" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-white border shadow-lg">
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

                            <FormField
                              control={form.control}
                              name="recurrenceEndDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">End Date</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="date"
                                      value={field.value ? format(new Date(field.value), "yyyy-MM-dd") : ""}
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
                                  const files = Array.from(e.target.files || []);
                                  setSelectedFiles(files);
                                  field.onChange([]);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                            {selectedFiles.length > 0 && (
                              <div className="text-sm text-muted-foreground">
                                Selected {selectedFiles.length} file(s)
                              </div>
                            )}
                          </FormItem>
                        )}
                      />

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
                              <SelectContent className="bg-white border shadow-lg">
                                <SelectItem value="entertainment">Entertainment</SelectItem>
                                <SelectItem value="government">Government</SelectItem>
                                <SelectItem value="social">Social</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-6">
                      <div className="border-t pt-6">
                        <h3 className="text-xl font-semibold mb-4">Contact Information (Optional)</h3>
                      </div>

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
                                checked={field.value as boolean}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

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
                              <PhoneInput
                                value={field.value || ""}
                                onChange={field.onChange}
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

                      <FormField
                        control={form.control}
                        name="hoursOfOperation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hours of Operation</FormLabel>
                            <FormControl>
                              <HoursOperationPicker
                                value={JSON.stringify(field.value || defaultHours)}
                                onChange={(value) => {
                                  try {
                                    field.onChange(JSON.parse(value));
                                  } catch (error) {
                                    console.error("Invalid hours format:", error);
                                    field.onChange(defaultHours);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-end">
                      <DialogClose asChild>
                        <Button type="button" variant="outline" className="w-full sm:w-auto">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button
                        type="submit"
                        className="w-full sm:w-auto"
                        disabled={createEventMutation.isPending}
                      >
                        {createEventMutation.isPending ? "Creating..." : "Create Event"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 lg:gap-8">
        <div className={`${viewType === 'day' || viewType === 'week' ? 'lg:col-span-5' : 'lg:col-span-3'} w-full`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-1">
                {/* Only show Month button on desktop */}
                {!isMobile && (
                  <Button
                    variant={viewType === 'month' ? 'default' : 'outline'}
                    onClick={() => setViewType('month')}
                    size="sm"
                    className="sm:h-10"
                  >
                    Month
                  </Button>
                )}
                <Button
                  variant={viewType === 'week' ? 'default' : 'outline'}
                  onClick={() => setViewType('week')}
                  size="sm"
                  className="sm:h-10"
                >
                  Week
                </Button>
                <Button
                  variant={viewType === 'day' ? 'default' : 'outline'}
                  onClick={() => setViewType('day')}
                  size="sm"
                  className="sm:h-10"
                >
                  Day
                </Button>

                {/* Real-time refresh button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm" 
                        className="sm:h-10 ml-1"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                      >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Refresh calendar</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
                className="ml-0 sm:ml-4 mt-2 sm:mt-0"
              >
                <SelectTrigger className="w-[200px] h-10">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-semibold text-md py-2">All Categories</SelectItem>
                  <SelectItem value="entertainment" className="text-white bg-[#47759a] text-md py-2 my-1">
                    Entertainment & Activities
                  </SelectItem>
                  <SelectItem value="government" className="text-navy bg-[#e9dfe0] text-md py-2 my-1">
                    Government & Politics
                  </SelectItem>
                  <SelectItem value="social" className="text-navy bg-[#efe59c] text-md py-2 my-1">
                    Social Clubs
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Badge requirement filter */}
              <div className="flex items-center space-x-2 ml-4 mt-2 sm:mt-0">
                <div className="flex flex-col justify-center mr-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium whitespace-nowrap">Badge Filter:</span>
                  </div>
                </div>
                <div className="flex space-x-2 items-center border rounded-md p-1">
                  <button
                    type="button"
                    onClick={() => setBadgeFilter(null)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      badgeFilter === null ? 'bg-primary text-white' : 'bg-transparent hover:bg-gray-100'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setBadgeFilter(true)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      badgeFilter === true ? 'bg-primary text-white' : 'bg-transparent hover:bg-gray-100'
                    }`}
                  >
                    <CreditCard className="h-3 w-3 text-primary" />
                    Badge Required
                  </button>
                  <button
                    type="button"
                    onClick={() => setBadgeFilter(false)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      badgeFilter === false ? 'bg-primary text-white' : 'bg-transparent hover:bg-gray-100'
                    }`}
                  >
                    <BanIcon className="h-3 w-3" />
                    No Badge
                  </button>
                </div>
              </div>
            </div>
          </div>

          {viewType === 'month' ? (
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border w-full bg-white overflow-hidden"
              components={{
                DayContent: ({ date }) => renderDayContent(date)
              }}
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full max-w-full",
                month: "space-y-2 w-full max-w-full", // Ensure month takes full width
                caption: "flex justify-center pt-1 pb-1 relative items-center", // Reduced padding
                caption_label: "text-lg font-semibold", // Smaller font on mobile
                nav: "space-x-1 flex items-center", // Reduced spacing
                nav_button: cn(
                  buttonVariants({ variant: "outline" }),
                  "h-7 w-7 md:h-9 md:w-9 bg-transparent p-0 opacity-70 hover:opacity-100" // Smaller nav buttons on mobile
                ),
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full max-w-full border-collapse space-y-0 table-fixed", // Added table-fixed for proper column widths
                head_row: "flex w-full max-w-full flex-nowrap",
                head_cell: "text-muted-foreground rounded-md w-[14.28%] min-w-[14.28%] max-w-[14.28%] font-semibold text-xs md:text-base h-8 md:h-12 sticky top-0 bg-white z-10 p-0", // Added min-width to ensure cell width
                head_cell_content: ({ title, ...props }) => {
                  // Use shorter abbrevations on mobile
                  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                  const shortened = {
                    "Sunday": "Su",
                    "Monday": "Mo",
                    "Tuesday": "Tu",
                    "Wednesday": "We",
                    "Thursday": "Th", 
                    "Friday": "Fr",
                    "Saturday": "Sa"
                  };

                  return <span className="block text-center px-0">{isMobile ? shortened[title] || title : title}</span>;
                },
                row: "flex w-full max-w-full flex-nowrap mt-0", // Added max-width to ensure no overflow
                cell: "relative w-[14.28%] min-w-[14.28%] max-w-[14.28%] h-12 md:h-28 p-0 bg-white border text-center hover:bg-accent hover:text-accent-foreground focus-within:relative focus-within:z-20 overflow-hidden hover:overflow-auto calendar-cell", // Added min-width to ensure cell width
                day: "h-full w-full p-0 font-normal aria-selected:opacity-100 flex flex-col",
                day_range_end: "day-range-end",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "text-muted-foreground opacity-50 bg-white",
                day_disabled: "text-muted-foreground opacity-50",
                day_hidden: "invisible",
              }}
            />
          ) : viewType === 'week' ? (
            renderWeeklyView()
          ) : (
            renderDailyView()
          )}
        </div>

        {viewType === 'month' && (
          <div className="lg:col-span-2 space-y-4 pl-2 lg:pl-4">
            <div className="space-y-4">
              <h2 className="text-xl md:text-2xl font-semibold flex items-center gap-2 md:gap-3 flex-wrap">
                <CalendarIcon className="h-5 w-5 md:h-6 md:w-6" />
                <span className="hidden md:inline">Events for {format(selectedDate, "MMMM d, yyyy")}</span>
                <span className="md:hidden">Events for {format(selectedDate, "MMM d, yyyy")}</span>
              </h2>
            </div>

            {isLoading ? (
              <div className="text-xl">Loading events...</div>
            ) : events.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {getEventsForSelectedDate().map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="text-xl text-muted-foreground">No events scheduled for this day</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}