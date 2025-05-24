import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommunityShowcase } from "@/components/home/community-showcase";
import { SearchBar } from "@/components/home/search-bar";
import { useQuery } from "@tanstack/react-query";
import { type Event } from "@shared/schema";
import { EventCard } from "@/components/calendar/event-card";
import { CalendarIcon } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function HomePage() {
  const { user } = useAuth();
  const today = new Date();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const getFilteredEvents = (events: Event[]) => {
    if (selectedCategory === "all") return events;
    return events.filter(event => event.category === selectedCategory);
  };

  const todaysEvents = getFilteredEvents(events).filter((event) =>
    isSameDay(new Date(event.startDate), today)
  );

  return (
    <div className="space-y-6">
      <section className="text-center pt-8 pb-8 space-y-3 overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight drop-shadow-md animate-slide-up">
          Welcome to Barefoot Bay
        </h1>
        <p className="hidden md:block text-3xl max-w-4xl mx-auto leading-relaxed drop-shadow animate-slide-up-delayed text-white transition-colors duration-500 hover:text-navy">
          Your Community Hub for Events, Club Activities, News, General Discussion, and more
        </p>

        <div className="mt-8">
          <SearchBar />
        </div>
      </section>

      <section>
        <CommunityShowcase />
      </section>

      <section className="max-w-6xl mx-auto px-8">
        <div className="space-y-6">
          {/* Mobile: Stacked layout - Title first, then filter */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-xl md:text-2xl font-semibold flex items-center gap-2 md:gap-3 order-first">
              <CalendarIcon className="h-5 w-5 md:h-6 md:w-6 hidden md:inline" />
              <span className="hidden md:inline">Events for {format(today, "MMMM d, yyyy")}</span>
              <span className="md:hidden">Events for {format(today, "MMM d, yyyy")}</span>
            </h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2 md:mt-0">
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-full sm:w-[220px] h-12 text-xl">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-semibold text-xl py-3">All Categories</SelectItem>
                  <SelectItem value="entertainment" className="text-white bg-[#47759a] text-xl py-3 my-1">
                    Entertainment & Activities
                  </SelectItem>
                  <SelectItem value="government" className="text-navy bg-[#e9dfe0] text-xl py-3 my-1">
                    Government & Politics
                  </SelectItem>
                  <SelectItem value="social" className="text-navy bg-[#efe59c] text-xl py-3 my-1">
                    Social Clubs
                  </SelectItem>
                </SelectContent>
              </Select>
              <Link href="/calendar" className="w-full sm:w-auto">
                <Button variant="outline" className="h-12 text-xl px-6 w-full sm:w-auto">View All Events</Button>
              </Link>
            </div>
          </div>

          {isLoading ? (
            <div className="text-xl">Loading events...</div>
          ) : todaysEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {todaysEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <Card className="bg-white/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <p className="text-xl text-muted-foreground text-center horizontal-only">No events scheduled for today</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Feature boxes removed as requested */}

      {!user && (
        <div className="text-center mt-20 mb-16">
          <p className="text-2xl mb-8 text-navy font-semibold">Join our community to access all features</p>
          <Link href="/auth">
            <Button size="lg" className="px-12 py-8 text-xl text-white">Sign Up Now</Button>
          </Link>
        </div>
      )}
    </div>
  );
}