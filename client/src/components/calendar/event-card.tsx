import { format } from "date-fns";
import { MapPin, Calendar, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Event } from "@shared/schema";
import { Link } from "wouter";
import { getMediaUrl } from "@/lib/media-helper";

const categoryColors = {
  entertainment: "bg-[#47759a] text-white font-semibold text-base",
  government: "bg-[#e9dfe0] text-navy font-semibold text-base",
  social: "bg-[#efe59c] text-navy font-semibold text-base",
  other: "bg-gray-200 text-gray-900 font-semibold text-base",
};

const categoryLabels = {
  entertainment: "Entertainment & Activities",
  government: "Government & Politics",
  social: "Social Clubs",
  other: "Other",
};

export function EventCard({ event }: { event: Event }) {
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);

  return (
    <Card className="hover:shadow-lg transition-shadow border-2 flex flex-col h-full">
      <CardHeader className="pb-4">
        {/* Consistent stacked layout for all screen sizes */}
        <div className="flex flex-col space-y-2">
          <Badge 
            variant="secondary" 
            className={`${categoryColors[event.category as keyof typeof categoryColors] || categoryColors.other} self-start horizontal-only`}
          >
            {categoryLabels[event.category as keyof typeof categoryLabels] || categoryLabels.other}
          </Badge>
          <CardTitle className="text-2xl font-bold break-words min-w-0 event-title whitespace-normal horizontal-only">{event.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-grow flex flex-col">
        {event.mediaUrls && event.mediaUrls.length > 0 && (
          <div className="aspect-video overflow-hidden rounded-lg">
            <img 
              src={getMediaUrl(event.mediaUrls[0], 'event')} 
              alt="Event preview" 
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log(`Image failed to load: ${event.mediaUrls[0]}`);
                const filename = event.mediaUrls[0].split('/').pop();
                console.log(`Media service failed for ${filename}, trying default image`);
                (e.target as HTMLImageElement).src = getMediaUrl('', 'event'); // Use default event image
              }}
            />
          </div>
        )}

        {event.description && (
          <p className="text-lg text-muted-foreground line-clamp-2">{event.description}</p>
        )}

        <div className="space-y-4 text-base">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Calendar className="h-5 w-5" />
            <span className="font-medium">{format(startDate, "MMMM d, yyyy")}</span>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            <Clock className="h-5 w-5" />
            <span className="font-medium">
              {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="h-5 w-5" />
              <span className="line-clamp-1 font-medium">{event.location}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          <Link href={`/events/${event.id}`}>
            <Button variant="outline" className="w-full text-lg py-6 bg-primary hover:bg-[#ff6b6b] transition-colors text-white">
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}