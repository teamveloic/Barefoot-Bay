import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, Eye, MousePointer, Clock, Globe, PieChart, BarChart2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// Types for analytics data
interface DashboardData {
  timeRange: {
    startDate: string;
    endDate: string;
    days: number;
  };
  sessions: {
    total: number;
    uniqueVisitors: number;
    newVsReturning: {
      new: number;
      returning: number;
    };
    byDevice: Array<{
      device: string;
      count: number;
    }>;
    byBrowser: Array<{
      browser: string;
      count: number;
    }>;
    byCountry: Array<{
      country: string;
      count: number;
    }>;
  };
  pageViews: {
    total: number;
    topPages: Array<{
      url: string;
      title: string;
      views: number;
    }>;
    averageLoadTime: number;
  };
  events: {
    total: number;
    byType: Array<{
      type: string;
      count: number;
    }>;
  };
  location: {
    geoData: Array<{
      country: string;
      region: string;
      city: string;
      lat: number;
      lng: number;
      count: number;
    }>;
  };
  traffic: {
    byDay: Array<{
      date: string;
      sessions: number;
    }>;
    pageViewsByDay: Array<{
      date: string;
      pageViews: number;
    }>;
  };
}

interface ActiveUser {
  sessionId: string;
  user: {
    id: number;
    username: string;
    fullName: string;
  } | null;
  deviceType: string;
  browser: string;
  location: {
    country: string;
    city: string;
  };
  startTime: string;
  lastActiveTime: string;
  currentPage: {
    url: string;
    title: string;
  };
}

interface ActiveUsersData {
  count: number;
  users: ActiveUser[];
}

interface UserJourneyData {
  // For pathTransitions
  nodes?: Array<{
    id: string;
    title: string;
  }>;
  links?: Array<{
    source: string;
    target: string;
    value: number;
  }>;
  // For entryPages & exitPages
  url?: string;
  title?: string;
  count?: number;
}

const AnalyticsDashboard: React.FC = () => {
  const [range, setRange] = useState<number>(30);
  const [journeyType, setJourneyType] = useState<'pathTransitions' | 'entryPages' | 'exitPages'>('pathTransitions');

  // Fetch dashboard data
  const { data: dashboardData, isLoading: isLoadingDashboard, error: dashboardError } = useQuery<DashboardData>({
    queryKey: ['analytics', 'dashboard', range],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/dashboard?range=${range}&liveDataOnly=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics dashboard data');
      }
      const { data } = await response.json();
      return data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Fetch active users
  const { data: activeUsersData, isLoading: isLoadingActiveUsers, error: activeUsersError } = useQuery<ActiveUsersData>({
    queryKey: ['analytics', 'activeusers'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/active-users');
      if (!response.ok) {
        throw new Error('Failed to fetch active users data');
      }
      const result = await response.json();
      if (result.success && result.data) {
        return {
          count: result.data.length,
          users: result.data.map((user: any) => ({
            id: user.id || 'anonymous',
            name: user.name || 'Anonymous',
            currentPage: user.currentPage || '/',
            lastActivity: user.lastActivity || new Date().toISOString()
          }))
        };
      }
      return { count: 0, users: [] };
    },
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  // Fetch user journey data
  const { data: userJourneyData, isLoading: isLoadingJourney, error: journeyError } = useQuery<UserJourneyData[]>({
    queryKey: ['analytics', 'userjourney', journeyType, range],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/userjourney/${journeyType}?days=${range}&liveDataOnly=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch user journey data');
      }
      const { data } = await response.json();
      return data;
    },
  });

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate percentage
  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return '0%';
    return `${Math.round((value / total) * 100)}%`;
  };

  // Loading state
  if (isLoadingDashboard) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading analytics data...</span>
      </div>
    );
  }

  // Error state
  if (dashboardError) {
    return (
      <div className="bg-destructive/10 border border-destructive p-4 rounded-md my-4">
        <h3 className="text-destructive font-medium">Error loading analytics</h3>
        <p className="text-destructive/80">{(dashboardError as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <Select value={range.toString()} onValueChange={(value) => setRange(parseInt(value))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dashboardData && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="text-2xl font-bold">{dashboardData.sessions.total.toLocaleString()}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboardData.timeRange.startDate && formatDate(dashboardData.timeRange.startDate)} - {dashboardData.timeRange.endDate && formatDate(dashboardData.timeRange.endDate)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Page Views</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="text-2xl font-bold">{dashboardData.pageViews.total.toLocaleString()}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg {(dashboardData.pageViews.total / dashboardData.sessions.total).toFixed(1)} pages per session
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Visitors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="text-2xl font-bold">{dashboardData.sessions.uniqueVisitors.toLocaleString()}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculatePercentage(dashboardData.sessions.newVsReturning.new, dashboardData.sessions.total)} new, {calculatePercentage(dashboardData.sessions.newVsReturning.returning, dashboardData.sessions.total)} returning
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <MousePointer className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="text-2xl font-bold">{dashboardData.events.total.toLocaleString()}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Interactions tracked across pages
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard Tabs */}
          <Tabs defaultValue="traffic" className="w-full">
            <TabsList className="grid grid-cols-5 w-full md:w-auto">
              <TabsTrigger value="traffic">Traffic</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="geo">Geography</TabsTrigger>
            </TabsList>

            {/* Traffic Tab */}
            <TabsContent value="traffic" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Traffic Overview</CardTitle>
                  <CardDescription>Sessions and page views over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex items-center justify-center">
                    {/* Here you would integrate a chart library like Recharts */}
                    <div className="text-muted-foreground">
                      Traffic chart would be displayed here. Data available for {dashboardData.traffic.byDay.length} days.
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Sessions by Device</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboardData.sessions.byDevice.map((device) => (
                        <div key={device.device} className="flex items-center justify-between">
                          <span>{device.device}</span>
                          <div className="flex items-center">
                            <span className="mr-2">{device.count}</span>
                            <span className="text-muted-foreground">
                              ({calculatePercentage(device.count, dashboardData.sessions.total)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Browser Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboardData.sessions.byBrowser.map((browser) => (
                        <div key={browser.browser} className="flex items-center justify-between">
                          <span>{browser.browser}</span>
                          <div className="flex items-center">
                            <span className="mr-2">{browser.count}</span>
                            <span className="text-muted-foreground">
                              ({calculatePercentage(browser.count, dashboardData.sessions.total)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Pages Tab */}
            <TabsContent value="pages" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top Pages</CardTitle>
                  <CardDescription>Most viewed pages in the selected date range</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardData.pageViews.topPages.map((page, index) => (
                      <div key={index} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
                        <div className="flex-1 truncate">
                          <div className="font-medium">{page.title || 'Untitled Page'}</div>
                          <div className="text-sm text-muted-foreground truncate">{page.url}</div>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-2">{page.views}</span>
                          <span className="text-muted-foreground">
                            ({calculatePercentage(page.views, dashboardData.pageViews.total)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>User Journey</CardTitle>
                  <div className="flex items-center space-x-2 mt-2">
                    <Select value={journeyType} onValueChange={(value) => setJourneyType(value as any)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select view" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pathTransitions">Path Transitions</SelectItem>
                        <SelectItem value="entryPages">Entry Pages</SelectItem>
                        <SelectItem value="exitPages">Exit Pages</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingJourney ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : journeyError ? (
                    <div className="text-destructive">{(journeyError as Error).message}</div>
                  ) : (
                    <div className="space-y-2">
                      {journeyType === 'pathTransitions' ? (
                        <div className="h-[300px] flex items-center justify-center">
                          <div className="text-muted-foreground">
                            Path transition visualization would be displayed here.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {userJourneyData?.map((page, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
                              <div className="flex-1 truncate">
                                <div className="font-medium">{page.title || 'Untitled Page'}</div>
                                <div className="text-sm text-muted-foreground truncate">{page.url}</div>
                              </div>
                              <div>{page.count}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Active Users</CardTitle>
                  <CardDescription>
                    {isLoadingActiveUsers ? 'Loading...' : `${activeUsersData?.count || 0} users active in the last 15 minutes`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingActiveUsers ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : activeUsersError ? (
                    <div className="text-destructive">{(activeUsersError as Error).message}</div>
                  ) : (
                    <div className="space-y-2">
                      {activeUsersData?.users.map((user) => (
                        <div key={user.sessionId} className="p-2 hover:bg-muted rounded-md">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">
                              {user.user ? user.user.username : 'Anonymous User'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {user.location.city}, {user.location.country}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="text-muted-foreground">
                              {user.deviceType} / {user.browser}
                            </div>
                            <div className="text-muted-foreground">
                              Active for {formatTimeDifference(new Date(user.startTime), new Date(user.lastActiveTime))}
                            </div>
                          </div>
                          <div className="mt-1 text-sm">
                            <span className="font-medium">Current page:</span> {user.currentPage.title || user.currentPage.url}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>New vs Returning</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] flex items-center justify-center">
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-8">
                        <div>
                          <div className="text-3xl font-bold">{dashboardData.sessions.newVsReturning.new}</div>
                          <div className="text-muted-foreground">New Visitors</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold">{dashboardData.sessions.newVsReturning.returning}</div>
                          <div className="text-muted-foreground">Returning Visitors</div>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-muted">
                        <div 
                          className="bg-primary"
                          style={{ width: calculatePercentage(dashboardData.sessions.newVsReturning.new, dashboardData.sessions.total) }}
                        ></div>
                      </div>
                      <div className="mt-2 flex justify-between text-xs">
                        <span>New: {calculatePercentage(dashboardData.sessions.newVsReturning.new, dashboardData.sessions.total)}</span>
                        <span>Returning: {calculatePercentage(dashboardData.sessions.newVsReturning.returning, dashboardData.sessions.total)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Events by Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardData.events.byType.map((event) => (
                      <div key={event.type} className="flex items-center justify-between">
                        <span>{event.type}</span>
                        <div className="flex items-center">
                          <span className="mr-2">{event.count}</span>
                          <span className="text-muted-foreground">
                            ({calculatePercentage(event.count, dashboardData.events.total)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Geography Tab */}
            <TabsContent value="geo" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Visitors by Country</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardData.sessions.byCountry.map((country) => (
                      <div key={country.country} className="flex items-center justify-between">
                        <span>{country.country || 'Unknown'}</span>
                        <div className="flex items-center">
                          <span className="mr-2">{country.count}</span>
                          <span className="text-muted-foreground">
                            ({calculatePercentage(country.count, dashboardData.sessions.total)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Visitor Map</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] flex items-center justify-center">
                    <div className="text-muted-foreground">
                      Geographic map visualization would be displayed here. Data for {dashboardData.location.geoData.length} locations.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

// Helper function to format time difference
const formatTimeDifference = (start: Date, end: Date) => {
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  
  if (diffHrs > 0) {
    return `${diffHrs}h ${diffMins % 60}m`;
  }
  
  return `${diffMins}m`;
};

export default AnalyticsDashboard;