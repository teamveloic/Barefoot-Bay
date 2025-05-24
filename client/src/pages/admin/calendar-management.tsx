import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Calendar,
  Trash2,
  RefreshCw,
  AlertCircle,
  Calendar as CalendarIcon,
  ArrowLeft,
  CheckCircle2 
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/layouts/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { BulkEventUpload } from "@/components/calendar/bulk-event-upload";
import CalendarMediaMigration from "@/components/admin/calendar-media-migration";
import { Link } from "wouter";

type Event = {
  id: number;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  category: string;
  location: string | null;
  createdAt: string;
  createdBy: number | null;
};

export default function CalendarManagement() {
  const { toast } = useToast();
  const [selectedEvents, setSelectedEvents] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Fetch events
  const eventsQuery = useQuery({
    queryKey: ["/api/events"],
    select: (data: Event[]) => {
      // Sort by startDate descending (newest first)
      return [...data].sort((a, b) => 
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
    }
  });

  // Delete individual event
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete event");
      }
      
      return eventId;
    },
    onSuccess: (eventId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedEvents(prev => prev.filter(id => id !== eventId));
      toast({
        title: "Event Deleted",
        description: "The event has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete event",
        variant: "destructive",
      });
    }
  });

  // Delete multiple events
  const deleteMultipleEventsMutation = useMutation({
    mutationFn: async (eventIds: number[]) => {
      const promises = eventIds.map(id => 
        fetch(`/api/events/${id}`, {
          method: "DELETE",
          credentials: "include",
        })
      );
      const results = await Promise.all(promises);
      
      const failedDeletions = results.filter(r => !r.ok).length;
      if (failedDeletions > 0) {
        throw new Error(`Failed to delete ${failedDeletions} events`);
      }
      
      return eventIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedEvents([]);
      toast({
        title: "Events Deleted",
        description: "Selected events have been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete events",
        variant: "destructive",
      });
    }
  });

  // Delete all events
  const deleteAllEventsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/events", {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete all events");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedEvents([]);
      toast({
        title: "All Events Deleted",
        description: "All events have been successfully deleted from the calendar.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete all events",
        variant: "destructive",
      });
    }
  });

  // Handle row selection
  const handleRowSelection = (eventId: number) => {
    setSelectedEvents(prev => {
      if (prev.includes(eventId)) {
        return prev.filter(id => id !== eventId);
      } else {
        return [...prev, eventId];
      }
    });
  };

  // Select all events
  const selectAllEvents = () => {
    if (eventsQuery.data) {
      if (selectedEvents.length === eventsQuery.data.length) {
        setSelectedEvents([]);  // Deselect all if all are selected
      } else {
        setSelectedEvents(eventsQuery.data.map(event => event.id));
      }
    }
  };

  // Format date helper
  const formatEventDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy - h:mm a");
    } catch (e) {
      return dateString;
    }
  };

  // Define table columns
  const columns = [
    {
      header: "ID",
      accessorKey: "id",
      cell: ({ row }: any) => (
        <Link href={`/events/${row.original.id}`}>
          <span className="text-xs font-mono text-primary hover:underline cursor-pointer">
            #{row.original.id}
          </span>
        </Link>
      ),
    },
    {
      header: "Title",
      accessorKey: "title",
      cell: ({ row }: any) => (
        <div className="font-medium truncate max-w-[200px]" title={row.original.title}>
          {row.original.title}
        </div>
      ),
    },
    {
      header: "Category",
      accessorKey: "category",
      cell: ({ row }: any) => (
        <Badge variant="outline" className="capitalize">
          {row.original.category}
        </Badge>
      ),
    },
    {
      header: "Start Date",
      accessorKey: "startDate",
      cell: ({ row }: any) => (
        <span className="text-xs whitespace-nowrap">
          {formatEventDate(row.original.startDate)}
        </span>
      ),
    },
    {
      header: "End Date",
      accessorKey: "endDate",
      cell: ({ row }: any) => (
        <span className="text-xs whitespace-nowrap">
          {formatEventDate(row.original.endDate)}
        </span>
      ),
    },
    {
      header: "Location",
      accessorKey: "location",
      cell: ({ row }: any) => (
        <span className="text-xs truncate max-w-[150px]" title={row.original.location}>
          {row.original.location || "N/A"}
        </span>
      ),
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => handleRowSelection(row.original.id)}
          >
            {selectedEvents.includes(row.original.id) ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <div className="h-4 w-4 border border-muted-foreground rounded-sm" />
            )}
          </Button>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={() => deleteEventMutation.mutate(row.original.id)}
                  disabled={deleteEventMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete Event</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="container p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="h-7 w-7" />
              Calendar Management
            </h1>
            <p className="text-muted-foreground">
              Manage all events in the community calendar.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            <BulkEventUpload />
          </div>
        </div>
        
        <div className="grid gap-6 mb-8">
          {/* Media Migration Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Calendar Media Migration</CardTitle>
              <CardDescription>
                Migrate calendar event media from filesystem to Replit Object Storage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CalendarMediaMigration />
            </CardContent>
          </Card>
          
          {/* Events Statistics Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Events Statistics</CardTitle>
              <CardDescription>
                Overview of calendar events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col items-center justify-center p-4 bg-muted rounded-md">
                  <CalendarIcon className="h-8 w-8 text-primary mb-2" />
                  <span className="text-2xl font-bold">
                    {eventsQuery.isLoading ? "..." : eventsQuery.data?.length || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Total Events
                  </span>
                </div>
                
                <div className="flex flex-col items-center justify-center p-4 bg-muted rounded-md">
                  <div className="flex gap-1">
                    {(eventsQuery.data || []).slice(0, 5).map(cat => 
                      cat.category
                    ).filter((v, i, a) => a.indexOf(v) === i).map((category, i) => (
                      <Badge key={i} variant="outline" className="capitalize">
                        {category}
                      </Badge>
                    ))}
                  </div>
                  <span className="text-2xl font-bold mt-2">
                    {eventsQuery.isLoading ? "..." : 
                      new Set((eventsQuery.data || []).map(event => event.category)).size}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Unique Categories
                  </span>
                </div>
                
                <div className="flex flex-col items-center justify-center p-4 bg-muted rounded-md">
                  <span className="text-sm text-muted-foreground mb-2">
                    Selected Events
                  </span>
                  <span className="text-2xl font-bold">
                    {selectedEvents.length}
                  </span>
                  <div className="flex gap-2 mt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={selectAllEvents}
                      disabled={eventsQuery.isLoading || (eventsQuery.data?.length || 0) === 0}
                    >
                      {selectedEvents.length === (eventsQuery.data?.length || 0) ? "Deselect All" : "Select All"}
                    </Button>
                    
                    <Button 
                      variant="destructive" 
                      size="sm"
                      disabled={selectedEvents.length === 0 || deleteMultipleEventsMutation.isPending}
                      onClick={() => deleteMultipleEventsMutation.mutate(selectedEvents)}
                    >
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Event Management</CardTitle>
                  <CardDescription>
                    View and manage all calendar events.
                  </CardDescription>
                </div>
                
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/events"] })}
                    disabled={eventsQuery.isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${eventsQuery.isLoading ? "animate-spin" : ""}`} />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete All Events
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-destructive" />
                          Delete All Events
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete all events from the community calendar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAllEventsMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {eventsQuery.isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : eventsQuery.error ? (
                <div className="flex justify-center items-center py-8 text-destructive">
                  <AlertCircle className="h-6 w-6 mr-2" />
                  <span>Error loading events</span>
                </div>
              ) : eventsQuery.data?.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mb-4" />
                  <h3 className="text-lg font-medium">No events found</h3>
                  <p className="text-center mt-1">
                    Use the bulk upload button to add events to the calendar.
                  </p>
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={eventsQuery.data.filter(event => 
                    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (event.description?.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    event.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (event.location?.toLowerCase().includes(searchTerm.toLowerCase()))
                  )}
                  searchColumn="title"
                />
              )}
            </CardContent>
            
            {(eventsQuery.data?.length || 0) > 0 && (
              <CardFooter className="justify-between border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {eventsQuery.data?.length} event{eventsQuery.data?.length === 1 ? "" : "s"}
                </div>
                
                <div className="flex gap-2">
                  {selectedEvents.length > 0 && (
                    <Button
                      variant="destructive"
                      onClick={() => deleteMultipleEventsMutation.mutate(selectedEvents)}
                      disabled={deleteMultipleEventsMutation.isPending}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete {selectedEvents.length} Selected Events
                    </Button>
                  )}
                </div>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}