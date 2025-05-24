import express from 'express';
import { analyticsService } from '../services/analytics-service';
import { db } from '../db';
import { 
  analyticsSessions, 
  analyticsPageViews, 
  analyticsEvents
} from '@shared/schema';
import { and, count, desc, eq, gte, or, sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';

const router = express.Router();

/**
 * Generate test geo data for the dashboard when running in development
 * This is only used when there's no real geo data in the database
 */
function generateTestGeoData() {
  // Common page paths from our site
  const pagePaths = [
    '/home', 
    '/forum', 
    '/calendar', 
    '/vendors',
    '/listings',
    '/community',
    '/membership',
    '/contact'
  ];
  
  // Create sample visitor locations across the US
  const locations = [
    // Florida
    {
      country: 'US',
      region: 'FL',
      city: 'Orlando',
      latitude: 28.5383,
      longitude: -81.3792,
      session_count: 35,
      ip: '192.168.1.10',
      device: 'desktop',
      browser: 'Chrome 135.0.0.0',
      visited_pages: ['/home', '/forum', '/calendar']
    },
    {
      country: 'US',
      region: 'FL',
      city: 'Miami',
      latitude: 25.7617,
      longitude: -80.1918,
      session_count: 28,
      ip: '192.168.1.11',
      device: 'mobile',
      browser: 'Safari 16.0',
      visited_pages: ['/home', '/vendors', '/calendar']
    },
    {
      country: 'US',
      region: 'FL',
      city: 'Tampa',
      latitude: 27.9506,
      longitude: -82.4572,
      session_count: 21,
      ip: '192.168.1.12',
      device: 'desktop',
      browser: 'Firefox 115.0',
      visited_pages: ['/forum', '/calendar', '/listings']
    },
    // Other states
    {
      country: 'US',
      region: 'NY',
      city: 'New York',
      latitude: 40.7128,
      longitude: -74.0060,
      session_count: 18,
      ip: '192.168.1.13',
      device: 'desktop',
      browser: 'Chrome 135.0.0.0',
      visited_pages: ['/home', '/membership', '/community']
    },
    {
      country: 'US',
      region: 'CA',
      city: 'Los Angeles',
      latitude: 34.0522,
      longitude: -118.2437,
      session_count: 15,
      ip: '192.168.1.14',
      device: 'tablet',
      browser: 'Safari 15.0',
      visited_pages: ['/listings', '/calendar', '/vendors']
    },
    {
      country: 'US',
      region: 'TX',
      city: 'Houston',
      latitude: 29.7604,
      longitude: -95.3698,
      session_count: 12,
      ip: '192.168.1.15',
      device: 'mobile',
      browser: 'Chrome 135.0.0.0',
      visited_pages: ['/home', '/forum', '/community']
    },
    {
      country: 'US',
      region: 'IL',
      city: 'Chicago',
      latitude: 41.8781,
      longitude: -87.6298,
      session_count: 10,
      ip: '192.168.1.16',
      device: 'desktop',
      browser: 'Edge 114.0',
      visited_pages: ['/community', '/membership', '/calendar']
    },
    {
      country: 'US',
      region: 'GA',
      city: 'Atlanta',
      latitude: 33.7490,
      longitude: -84.3880,
      session_count: 8,
      ip: '192.168.1.17',
      device: 'desktop',
      browser: 'Chrome 135.0.0.0',
      visited_pages: ['/home', '/forum', '/vendors']
    }
  ];
  
  return locations;
}

// Public route for basic site stats
router.get('/sitestats', async (req, res) => {
  try {
    const stats = await getPublicSiteStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting public site stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get site stats'
    });
  }
});

// Main public analytics endpoint - used by analytics dashboard
router.get('/public', async (req, res) => {
  try {
    const range = parseInt(req.query.range as string) || 30;
    const liveDataOnly = req.query.liveDataOnly === 'true';
    console.log(`[Analytics Public] Fetching public data for range: ${range} days${liveDataOnly ? ' (live data only)' : ''}`);
    
    const data = await getPublicAnalyticsData(range, liveDataOnly);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error getting public analytics data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics data'
    });
  }
});

// Public route for checking analytics API status and providing API keys
router.get('/status', (req, res) => {
  // Get API key from environment or configuration
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  
  res.status(200).json({
    success: true,
    message: 'Analytics public API is operational',
    config: {
      googleMapsApiKey
    }
  });
});

// Route for getting currently active users (users active in the last 5 minutes)
router.get('/active-users', async (req, res) => {
  try {
    // Get timestamp for 5 minutes ago
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
    const fiveMinutesAgoStr = fiveMinutesAgo.toISOString();
    
    // Query for sessions with activity in the last 5 minutes
    // Use the date directly in the query to avoid parameter issues
    const activeSessionsQuery = `
      SELECT DISTINCT 
        s.id,
        s.session_id,
        s.user_id,
        s.ip,
        s.device,
        COALESCE(u.username, 'Anonymous') as username,
        (
          SELECT path FROM analytics_page_views
          WHERE session_id = s.session_id
          ORDER BY timestamp DESC
          LIMIT 1
        ) as current_page,
        (
          SELECT timestamp FROM analytics_page_views
          WHERE session_id = s.session_id
          ORDER BY timestamp DESC
          LIMIT 1
        ) as last_activity
      FROM analytics_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE EXISTS (
        SELECT 1 FROM analytics_page_views
        WHERE session_id = s.session_id
        AND timestamp >= '${fiveMinutesAgoStr}'
      )
      ORDER BY last_activity DESC
      LIMIT 10
    `;
    
    // Execute the query without parameters
    const result = await db.execute(sql.raw(activeSessionsQuery));
    
    // Format active users data for the dashboard
    const activeUsers = result.rows.map((row: any) => ({
      name: row.username || 'Anonymous',
      currentPage: row.current_page || '/',
      lastActivity: row.last_activity
    }));
    
    // Return active users data
    res.status(200).json({
      success: true,
      data: activeUsers
    });
  } catch (error) {
    console.error('Error getting active users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active users'
    });
  }
});

// CSV export endpoint for analytics data
router.get('/export-csv', async (req, res) => {
  try {
    const range = parseInt(req.query.range as string) || 30;
    const liveDataOnly = req.query.liveDataOnly === 'true';
    console.log(`[Analytics Export] Generating CSV export for range: ${range} days${liveDataOnly ? ' (live data only)' : ''}`);
    
    // Get analytics data
    const data = await getPublicAnalyticsData(range, liveDataOnly);
    
    // Format data for CSV export
    const csvData = {
      metrics: [
        {
          label: 'Total Sessions',
          value: data.metrics.totalSessions
        },
        {
          label: 'Unique Visitors',
          value: data.metrics.uniqueVisitors
        },
        {
          label: 'Page Views',
          value: data.metrics.pageViews
        },
        {
          label: 'Avg. Session Duration (seconds)',
          value: data.metrics.avgSessionDuration
        },
        {
          label: 'Bounce Rate (%)',
          value: data.metrics.bounceRate
        },
        {
          label: 'Date Range',
          value: `${new Date(data.timeRange.startDate).toLocaleDateString()} to ${new Date(data.timeRange.endDate).toLocaleDateString()}`
        }
      ],
      // Format top pages data
      topPages: data.topPages.map(page => ({
        page: page.title,
        url: page.url,
        views: page.views
      })),
      // Format device data
      devices: data.devices,
      // Format browser data
      browsers: data.browsers,
      // Format referrer data
      referrers: data.referrers,
      // Format daily traffic data
      dailyTraffic: data.dailyVisitors,
      // Format geo data for export
      locations: data.geoData.locations.map(location => ({
        country: location.country,
        region: location.region,
        city: location.city,
        device: location.device,
        browser: location.browser,
        sessions: location.sessions,
        visitedPages: location.pages.map(p => p.path).join(', ')
      }))
    };
    
    // Create CSV content sections
    const metricsCSV = stringify(csvData.metrics, {
      header: true,
      columns: ['label', 'value']
    });
    
    const topPagesCSV = stringify(csvData.topPages, {
      header: true,
      columns: ['page', 'url', 'views']
    });
    
    const devicesCSV = stringify(csvData.devices, {
      header: true,
      columns: ['name', 'count']
    });
    
    const browsersCSV = stringify(csvData.browsers, {
      header: true,
      columns: ['name', 'count']
    });
    
    const referrersCSV = stringify(csvData.referrers, {
      header: true,
      columns: ['name', 'count']
    });
    
    const dailyTrafficCSV = stringify(csvData.dailyTraffic, {
      header: true,
      columns: ['date', 'visitors', 'sessions']
    });
    
    const locationsCSV = stringify(csvData.locations, {
      header: true,
      columns: ['country', 'region', 'city', 'device', 'browser', 'sessions', 'visitedPages']
    });
    
    // Combine all sections with headers
    const fullCSV = [
      'ANALYTICS DASHBOARD EXPORT',
      `Generated on: ${new Date().toLocaleString()}`,
      `Date Range: ${range} days${liveDataOnly ? ' (live data only)' : ' (includes test data)'}`,
      '\n',
      'SUMMARY METRICS',
      metricsCSV,
      '\n',
      'TOP PAGES',
      topPagesCSV,
      '\n',
      'DEVICE DISTRIBUTION',
      devicesCSV,
      '\n',
      'BROWSER DISTRIBUTION',
      browsersCSV,
      '\n',
      'REFERRERS / TRAFFIC SOURCES',
      referrersCSV,
      '\n',
      'DAILY TRAFFIC',
      dailyTrafficCSV,
      '\n',
      'VISITOR LOCATIONS',
      locationsCSV
    ].join('\n');
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-export-${new Date().toISOString().split('T')[0]}.csv`);
    
    // Send CSV data
    res.status(200).send(fullCSV);
  } catch (error) {
    console.error('Error generating CSV export:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSV export'
    });
  }
});

/**
 * Get basic site stats for public consumption
 * This provides just the key metrics that are safe to share publicly
 */
async function getPublicSiteStats() {
  try {
    // Get total page views (all time)
    const pageViewsResult = await db.select({
      count: count(analyticsPageViews.id),
    })
    .from(analyticsPageViews);
    
    const totalPageViews = pageViewsResult[0]?.count || 0;
    
    // Get total unique visitors (all time)
    const uniqueVisitorsResult = await db.select({
      count: count(sql`DISTINCT ${analyticsSessions.ip}`),
    })
    .from(analyticsSessions);
    
    const uniqueVisitors = uniqueVisitorsResult[0]?.count || 0;
    
    return {
      totalPageViews,
      uniqueVisitors,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting public site stats:', error);
    throw error;
  }
}

/**
 * Get analytics data for the public dashboard
 * @param days Number of days to include in the data (default: 30)
 * @param liveDataOnly If true, only include data from actual user visits (no test data)
 */
async function getPublicAnalyticsData(days: number = 30, liveDataOnly: boolean = false) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get sessions data
    let sessionsQuery = db.select({
      count: count(analyticsSessions.id),
    })
    .from(analyticsSessions)
    .where(gte(analyticsSessions.startTimestamp, startDate));
    
    // If liveDataOnly is true, exclude test data
    if (liveDataOnly) {
      sessionsQuery = sessionsQuery.where(and(
        gte(analyticsSessions.startTimestamp, startDate),
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const sessionsResult = await sessionsQuery;
    const totalSessions = sessionsResult[0]?.count || 0;
    
    // Get unique visitors (count unique IPs)
    let uniqueVisitorsQuery = db.select({
      count: count(sql`DISTINCT ${analyticsSessions.ip}`),
    })
    .from(analyticsSessions)
    .where(gte(analyticsSessions.startTimestamp, startDate));
    
    // If liveDataOnly is true, exclude test data
    if (liveDataOnly) {
      uniqueVisitorsQuery = uniqueVisitorsQuery.where(and(
        gte(analyticsSessions.startTimestamp, startDate),
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const uniqueVisitorsResult = await uniqueVisitorsQuery;
    
    const uniqueVisitors = uniqueVisitorsResult[0]?.count || 0;
    
    // Get average session duration
    const startDateStr = startDate.toISOString();
    let durationQuery = `
      SELECT AVG(duration) as avg_duration
      FROM analytics_sessions
      WHERE start_timestamp >= '${startDateStr}' 
        AND duration IS NOT NULL
    `;
    
    // If liveDataOnly is true, exclude test data
    if (liveDataOnly) {
      durationQuery += `
        AND user_agent NOT LIKE '%Linux%HeadlessChrome%'
        AND ip != '0.0.0.0' AND ip != 'unknown'
      `;
    }
    
    const durationResult = await db.execute(sql.raw(durationQuery));
    
    let avgSessionDuration = 0;
    if (durationResult && durationResult.rows.length > 0) {
      const avgDurationValue = durationResult.rows[0].avg_duration;
      avgSessionDuration = avgDurationValue ? parseInt(String(avgDurationValue)) : 0;
    }
    
    // Get page views
    let pageViewsQuery = db.select({
      count: count(analyticsPageViews.id),
    })
    .from(analyticsPageViews)
    .where(gte(analyticsPageViews.timestamp, startDate));
    
    // If liveDataOnly is true, exclude test data by joining with sessions and filtering
    if (liveDataOnly) {
      pageViewsQuery = db.select({
        count: count(analyticsPageViews.id),
      })
      .from(analyticsPageViews)
      .innerJoin(
        analyticsSessions, 
        eq(analyticsPageViews.sessionId, sql`CAST(${analyticsSessions.id} AS TEXT)`)
      )
      .where(and(
        gte(analyticsPageViews.timestamp, startDate),
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const pageViewsResult = await pageViewsQuery;
    const totalPageViews = pageViewsResult[0]?.count || 0;
    
    // Get top pages
    let topPagesQuery = db.select({
      path: analyticsPageViews.path,
      views: count(analyticsPageViews.id),
    })
    .from(analyticsPageViews)
    .where(gte(analyticsPageViews.timestamp, startDate));
    
    // If liveDataOnly is true, exclude test data by joining with sessions and filtering
    if (liveDataOnly) {
      topPagesQuery = db.select({
        path: analyticsPageViews.path,
        views: count(analyticsPageViews.id),
      })
      .from(analyticsPageViews)
      .innerJoin(
        analyticsSessions, 
        eq(analyticsPageViews.sessionId, analyticsSessions.sessionId)
      )
      .where(and(
        gte(analyticsPageViews.timestamp, startDate),
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const topPagesResult = await topPagesQuery
      .groupBy(analyticsPageViews.path)
      .orderBy(desc(count(analyticsPageViews.id)))
      .limit(10);
    
    // Format top pages for the dashboard
    const topPages = topPagesResult.map(page => ({
      url: page.path || '',
      title: getPageTitleFromPath(page.path || ''),
      views: Number(page.views)
    }));
    
    // Get device distribution
    let deviceQuery = db.select({
      device: analyticsSessions.device,
      count: count(analyticsSessions.id),
    })
    .from(analyticsSessions)
    .where(gte(analyticsSessions.startTimestamp, startDate));
    
    // If liveDataOnly is true, exclude test data (only include real user sessions)
    if (liveDataOnly) {
      deviceQuery = deviceQuery.where(and(
        gte(analyticsSessions.startTimestamp, startDate),
        // Exclude sessions created by our test script (these have specific user agents)
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        // Further exclude any sessions from our test script (these have specific user agents)
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const devicesResult = await deviceQuery
      .groupBy(analyticsSessions.device)
      .orderBy(desc(count(analyticsSessions.id)));
    
    // Get browser distribution
    let browserQuery = db.select({
      browser: analyticsSessions.browser,
      count: count(analyticsSessions.id),
    })
    .from(analyticsSessions)
    .where(gte(analyticsSessions.startTimestamp, startDate));
    
    // If liveDataOnly is true, exclude test data (only include real user sessions)
    if (liveDataOnly) {
      browserQuery = browserQuery.where(and(
        gte(analyticsSessions.startTimestamp, startDate),
        // Exclude sessions created by our test script
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const browsersResult = await browserQuery
      .groupBy(analyticsSessions.browser)
      .orderBy(desc(count(analyticsSessions.id)));
    
    // Get referrers
    let referrersQuery = db.select({
      referrer: analyticsPageViews.referrer,
      count: count(analyticsPageViews.id),
    })
    .from(analyticsPageViews)
    .where(and(
      gte(analyticsPageViews.timestamp, startDate),
      sql`${analyticsPageViews.referrer} IS NOT NULL`
    ));
    
    // If liveDataOnly is true, exclude test data by joining with sessions and filtering
    if (liveDataOnly) {
      referrersQuery = db.select({
        referrer: analyticsPageViews.referrer,
        count: count(analyticsPageViews.id),
      })
      .from(analyticsPageViews)
      .innerJoin(
        analyticsSessions, 
        eq(analyticsPageViews.sessionId, analyticsSessions.sessionId)
      )
      .where(and(
        gte(analyticsPageViews.timestamp, startDate),
        sql`${analyticsPageViews.referrer} IS NOT NULL`,
        sql`${analyticsSessions.userAgent} NOT LIKE '%Linux%HeadlessChrome%'`,
        sql`(${analyticsSessions.ip} != '0.0.0.0' AND ${analyticsSessions.ip} != 'unknown')`
      ));
    }
    
    const referrersResult = await referrersQuery
      .groupBy(analyticsPageViews.referrer)
      .orderBy(desc(count(analyticsPageViews.id)))
      .limit(10);
    
    // Get geo data with more detailed information, including page visits
    // Use the startDateStr that was already defined earlier
    let geoQuery = `
      SELECT 
        a.country, 
        a.city, 
        a.region, 
        a.ip, 
        a.device, 
        a.browser, 
        a.latitude, 
        a.longitude,
        COUNT(DISTINCT a.id) as session_count,
        ARRAY_AGG(DISTINCT p.path) as visited_pages
      FROM analytics_sessions a
      LEFT JOIN analytics_page_views p ON a.session_id = p.session_id
      WHERE 
        a.start_timestamp >= '${startDateStr}'
        AND a.latitude IS NOT NULL 
        AND a.longitude IS NOT NULL
    `;
    
    // If liveDataOnly is true, exclude test data
    if (liveDataOnly) {
      geoQuery += `
        AND a.user_agent NOT LIKE '%Linux%HeadlessChrome%'
        AND a.ip != '0.0.0.0' AND a.ip != 'unknown'
        AND a.ip != '8.8.8.8' AND a.ip != '61.195.190.223' AND a.ip != '61.195.190.224'
        AND a.ip != '61.195.190.222' AND a.ip != '82.132.234.245' AND a.ip != '82.132.234.246'
        AND a.ip != '82.132.234.244' AND a.ip != '52.54.54.54' AND a.ip != '85.214.132.117'
      `;
    }
    
    geoQuery += `
      GROUP BY 
        a.country, 
        a.city, 
        a.region, 
        a.ip, 
        a.device, 
        a.browser, 
        a.latitude, 
        a.longitude
      ORDER BY COUNT(DISTINCT a.id) DESC
    `;
    
    const geoResult = await db.execute(sql.raw(geoQuery));
    
    // If there's no geo data and we're NOT in liveDataOnly mode, generate test data
    // This ensures the map works when showing all data, but won't show fake locations in "Live data only" mode
    if ((!geoResult.rows || geoResult.rows.length === 0) && !liveDataOnly) {
      console.log('[Analytics Public] Using test geo data for dashboard');
      geoResult.rows = generateTestGeoData();
    } else if ((!geoResult.rows || geoResult.rows.length === 0) && liveDataOnly) {
      console.log('[Analytics Public] No geo data available for live data only mode');
      // Empty array for live data only mode when no real visitors exist
      geoResult.rows = [];
    }
    
    // Get daily traffic data
    const dailyTrafficData = await getDailyTrafficData(startDate, liveDataOnly);
    
    // Return data formatted for the dashboard
    return {
      metrics: {
        totalSessions,
        uniqueVisitors,
        avgSessionDuration,
        pageViews: totalPageViews,
        bounceRate: calculateBounceRate(totalSessions, totalPageViews)
      },
      topPages,
      devices: (() => {
        // Consolidate device types by creating a map to aggregate counts
        const deviceCounts = new Map();
        
        // Process each device type
        devicesResult.forEach(d => {
          // Standardize device types to lowercase and ensure valid categories
          let deviceName = (d.device || '').toLowerCase();
          
          // Map device types to standard categories (desktop, mobile, tablet)
          // Always classify as either desktop, mobile, or tablet - never unknown
          if (deviceName === 'mobile' || deviceName.includes('phone')) {
            deviceName = 'mobile';
          } else if (deviceName === 'tablet' || deviceName.includes('ipad')) {
            deviceName = 'tablet';
          } else {
            // Default to desktop for any unknown or ambiguous device type
            deviceName = 'desktop';
          }
          
          // Increment the count for this device type
          const currentCount = deviceCounts.get(deviceName) || 0;
          deviceCounts.set(deviceName, currentCount + Number(d.count || 0));
        });
        
        // Convert map to array for the expected format
        return Array.from(deviceCounts.entries()).map(([name, count]) => ({
          name,
          count
        }));
      })(),
      browsers: (() => {
        // Consolidate browser types by creating a map to aggregate counts
        const browserCounts = new Map();
        
        // Process each browser
        browsersResult.forEach(b => {
          // Get standardized browser name and normalize it
          let browserName = b.browser || 'Other';
          
          // Group all Chrome versions together
          if (browserName.startsWith('Chrome')) {
            browserName = 'Chrome';
          }
          
          // Rename Unknown to Other
          if (browserName === 'Unknown') {
            browserName = 'Other';
          }
          
          // Increment count for this browser
          const currentCount = browserCounts.get(browserName) || 0;
          browserCounts.set(browserName, currentCount + Number(b.count || 0));
        });
        
        // Convert map to array for the expected format
        return Array.from(browserCounts.entries()).map(([name, count]) => ({
          name,
          count
        }));
      })(),
      referrers: (() => {
        // Consolidate referrers by creating a map to aggregate counts
        const referrerCounts = new Map();
        
        // Process each referrer
        referrersResult.forEach(r => {
          // Format and standardize the referrer URL
          const referrerName = formatReferrerUrl(r.referrer || '');
          
          // Increment count for this referrer
          const currentCount = referrerCounts.get(referrerName) || 0;
          referrerCounts.set(referrerName, currentCount + Number(r.count || 0));
        });
        
        // Convert map to array for the expected format and sort by count
        return Array.from(referrerCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
      })(),
      geoData: {
        // Extract all unique page paths from all visitors for filtering options
        pages: (() => {
          // Get all paths and filter out duplicates
          const allPaths: string[] = [];
          const pathMap = new Map<string, boolean>();
          
          geoResult.rows.forEach((row: any) => {
            const paths = row.visited_pages || [];
            paths.filter(Boolean).forEach((path: string) => {
              if (!pathMap.has(path)) {
                pathMap.set(path, true);
                allPaths.push(path);
              }
            });
          });
          
          // Map paths to objects with title
          return allPaths.map((path: string) => ({
            path,
            title: getPageTitleFromPath(path)
          }));
        })(),
        
        locations: geoResult.rows.map((row: any) => {
          // Format visited pages to include both path and title
          const visitedPages = (row.visited_pages || [])
            .filter(Boolean)
            .map((path: string) => ({
              path,
              title: getPageTitleFromPath(path)
            }));
            
          // Standardize device type to lowercase and ensure valid categories
          let deviceType = (row.device || '').toLowerCase();
          
          // Map device types to standard categories (desktop, mobile, tablet)
          // Always classify as either desktop, mobile, or tablet - never unknown
          if (deviceType === 'mobile' || deviceType.includes('phone')) {
            deviceType = 'mobile';
          } else if (deviceType === 'tablet' || deviceType.includes('ipad')) {
            deviceType = 'tablet';
          } else {
            // Default to desktop for any unknown or ambiguous device type
            deviceType = 'desktop';
          }
          
          return {
            country: row.country || 'Unknown',
            region: row.region || '',
            city: row.city || 'Unknown',
            ip: row.ip || '',
            device: deviceType,
            browser: (() => {
              // Standardize browser name
              let browserName = row.browser || 'Other';
              
              // Group all Chrome versions
              if (browserName.startsWith('Chrome')) {
                browserName = 'Chrome';
              }
              
              // Rename Unknown to Other
              if (browserName === 'Unknown') {
                browserName = 'Other';
              }
              
              return browserName;
            })(),
            lat: Number(row.latitude),
            lng: Number(row.longitude),
            sessions: Number(row.session_count || 0),
            pages: visitedPages,
            weight: Math.min(Number(row.session_count || 0) / Math.max(1, totalSessions) * 10, 1)
          };
        })
      },
      dailyVisitors: dailyTrafficData,
      userJourneys: {
        pathTransitions: await getPathTransitions(startDate, liveDataOnly),
        entryPages: await getEntryPages(startDate, liveDataOnly),
        exitPages: await getExitPages(startDate, liveDataOnly)
      },
      timeRange: {
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        days,
      }
    };
  } catch (error) {
    console.error('Error getting public analytics data:', error);
    throw error;
  }
}

// Helper function to estimate bounce rate
function calculateBounceRate(sessions: number, pageViews: number): number {
  if (sessions === 0) return 0;
  // Estimate bounce rate as percentage of sessions with just one page view
  const estimatedBounces = Math.max(0, sessions - (pageViews - sessions));
  return Math.round((estimatedBounces / sessions) * 100);
}

// Helper function to format referrer URLs
function formatReferrerUrl(url: string): string {
  if (!url) return 'Direct / None';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (e) {
    return url;
  }
}

// Helper function to get a readable page title from path
function getPageTitleFromPath(path: string): string {
  if (!path) return 'Unknown Page';
  
  // Remove query string if present
  const pathOnly = path.split('?')[0];
  
  // Remove trailing slash if present
  const cleanPath = pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly;
  
  // If it's the homepage
  if (cleanPath === '' || cleanPath === '/') {
    return 'Homepage';
  }
  
  // Get the last segment of the path
  const segments = cleanPath.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  
  if (!lastSegment) return 'Unknown Page';
  
  // Replace hyphens and underscores with spaces and capitalize
  return lastSegment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

/**
 * Get daily traffic data for the specified date range
 * @param startDate The start date for the data range
 * @param liveDataOnly If true, only include data from actual user visits (no test data)
 * @returns Array of objects with date and visitor count
 */
async function getDailyTrafficData(startDate: Date, liveDataOnly: boolean = false) {
  try {
    // Convert Date to string for direct insertion in SQL
    const startDateStr = startDate.toISOString();
    
    // Build query with or without the test data filter
    let queryStr = `
      SELECT 
        DATE(start_timestamp) as day,
        COUNT(DISTINCT id) as sessions,
        COUNT(DISTINCT ip) as unique_visitors
      FROM analytics_sessions 
      WHERE start_timestamp >= '${startDateStr}'
    `;
    
    // If liveDataOnly is true, add filters to exclude test data
    if (liveDataOnly) {
      queryStr += `
        AND user_agent NOT LIKE '%Linux%HeadlessChrome%'
        AND ip != '0.0.0.0' AND ip != 'unknown'
      `;
    }
    
    queryStr += `
      GROUP BY DATE(start_timestamp)
      ORDER BY day ASC
    `;
    
    // Execute the query without parameters since we've embedded them directly
    const result = await db.execute(sql.raw(queryStr));
    
    // If no results, return empty days with zero counts (no dummy data)
    if (!result || !result.rows || result.rows.length === 0) {
      // Create date range with zero values for proper chart display
      const today = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        days.push(formatDate(date));
      }
      // Return real dates with zero values - not mock data
      return days.map(date => ({ date, visitors: 0, sessions: 0 }));
    }
    
    // Fill in missing dates in the range
    const days = getDaysInRange(startDate, new Date());
    const resultsMap = new Map();
    
    // Create a map of date -> count
    result.rows.forEach((row: any) => {
      if (row.day) {
        const dateStr = formatDate(new Date(String(row.day)));
        resultsMap.set(dateStr, {
          visitors: Number(row.unique_visitors) || 0,
          sessions: Number(row.sessions) || 0
        });
      }
    });
    
    // Map dates to array with 0 for missing dates
    return days.map(date => ({
      date,
      visitors: (resultsMap.get(date)?.visitors || 0),
      sessions: (resultsMap.get(date)?.sessions || 0)
    }));
  } catch (error) {
    console.error('Error getting daily traffic data:', error);
    // Return empty array to prevent dashboard errors
    return [];
  }
}

/**
 * Get array of formatted date strings in a date range
 */
function getDaysInRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  const current = new Date(start);
  
  while (current <= end) {
    days.push(formatDate(new Date(current)));
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get path transitions data for user journey visualization
 * @param startDate The start date for the data range
 * @param liveDataOnly If true, only include data from actual user visits (no test data)
 * @returns Array of objects with source, target and value
 */
async function getPathTransitions(startDate: Date, liveDataOnly: boolean = false) {
  try {
    // Convert Date to string for direct insertion in SQL
    const startDateStr = startDate.toISOString();
    
    // Create parameterized query string
    let queryStr = `
      WITH page_views AS (
        SELECT 
          pv.session_id,
          pv.path,
          pv.timestamp,
          ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.timestamp) as view_order
        FROM analytics_page_views pv
    `;
    
    // If liveDataOnly is true, add a join to sessions and filter test data
    if (liveDataOnly) {
      queryStr += `
        JOIN analytics_sessions s ON pv.session_id = s.session_id
        WHERE pv.timestamp >= '${startDateStr}'
          AND s.user_agent NOT LIKE '%Linux%HeadlessChrome%'
          AND s.ip != '0.0.0.0' AND s.ip != 'unknown'
      `;
    } else {
      queryStr += `
        WHERE pv.timestamp >= '${startDateStr}'
      `;
    }
    
    queryStr += `
      ),
      page_transitions AS (
        SELECT 
          a.path as source_page,
          b.path as target_page,
          COUNT(*) as transition_count
        FROM page_views a
        JOIN page_views b ON a.session_id = b.session_id AND a.view_order = b.view_order - 1
        GROUP BY a.path, b.path
        ORDER BY transition_count DESC
        LIMIT 20
      )
      SELECT 
        source_page,
        target_page,
        transition_count
      FROM page_transitions
      WHERE transition_count > 1
    `;
    
    // Execute the query without parameters since we've embedded them directly
    const result = await db.execute(sql.raw(queryStr));
    
    if (!result || !result.rows || result.rows.length === 0) {
      return [];
    }
    
    // Format the data for visualization
    return result.rows.map((row: any) => ({
      source: getPageTitleFromPath(row.source_page || ''),
      target: getPageTitleFromPath(row.target_page || ''),
      value: Number(row.transition_count)
    }));
  } catch (error) {
    console.error('Error getting path transitions data:', error);
    return [];
  }
}

/**
 * Get entry pages data for user journey visualization
 * @param startDate The start date for the data range
 * @param liveDataOnly If true, only include data from actual user visits (no test data)
 * @returns Array of entry pages with count
 */
async function getEntryPages(startDate: Date, liveDataOnly: boolean = false) {
  try {
    // Convert Date to string for direct insertion in SQL
    const startDateStr = startDate.toISOString();
    
    // Create parameterized query string
    let queryStr = `
      WITH first_page_views AS (
        SELECT 
          pv.session_id,
          pv.path,
          ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.timestamp) as view_order
        FROM analytics_page_views pv
    `;
    
    // If liveDataOnly is true, add a join to sessions and filter test data
    if (liveDataOnly) {
      queryStr += `
        JOIN analytics_sessions s ON pv.session_id = s.session_id
        WHERE pv.timestamp >= '${startDateStr}'
          AND s.user_agent NOT LIKE '%Linux%HeadlessChrome%'
          AND s.ip != '0.0.0.0' AND s.ip != 'unknown'
      `;
    } else {
      queryStr += `
        WHERE pv.timestamp >= '${startDateStr}'
      `;
    }
    
    queryStr += `
      )
      SELECT 
        path,
        COUNT(*) as entry_count
      FROM first_page_views
      WHERE view_order = 1
      GROUP BY path
      ORDER BY entry_count DESC
      LIMIT 10
    `;
    
    // Execute the query without parameters since we've embedded them directly
    const result = await db.execute(sql.raw(queryStr));
    
    if (!result || !result.rows || result.rows.length === 0) {
      return [];
    }
    
    // Format the data for visualization
    return result.rows.map((row: any) => ({
      page: getPageTitleFromPath(row.path || ''),
      count: Number(row.entry_count)
    }));
  } catch (error) {
    console.error('Error getting entry pages data:', error);
    return [];
  }
}

/**
 * Get exit pages data for user journey visualization
 * @param startDate The start date for the data range
 * @param liveDataOnly If true, only include data from actual user visits (no test data)
 * @returns Array of exit pages with count
 */
async function getExitPages(startDate: Date, liveDataOnly: boolean = false) {
  try {
    // Convert Date to string for direct insertion in SQL
    const startDateStr = startDate.toISOString();
    
    // Create parameterized query string
    let queryStr = `
      WITH last_page_views AS (
        SELECT 
          pv.session_id,
          pv.path,
          ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.timestamp DESC) as reverse_order
        FROM analytics_page_views pv
    `;
    
    // If liveDataOnly is true, add a join to sessions and filter test data
    if (liveDataOnly) {
      queryStr += `
        JOIN analytics_sessions s ON pv.session_id = s.session_id
        WHERE pv.timestamp >= '${startDateStr}'
          AND s.user_agent NOT LIKE '%Linux%HeadlessChrome%'
          AND s.ip != '0.0.0.0' AND s.ip != 'unknown'
      `;
    } else {
      queryStr += `
        WHERE pv.timestamp >= '${startDateStr}'
      `;
    }
    
    queryStr += `
      )
      SELECT 
        path,
        COUNT(*) as exit_count
      FROM last_page_views
      WHERE reverse_order = 1
      GROUP BY path
      ORDER BY exit_count DESC
      LIMIT 10
    `;
    
    // Execute the query without parameters since we've embedded them directly
    const result = await db.execute(sql.raw(queryStr));
    
    if (!result || !result.rows || result.rows.length === 0) {
      return [];
    }
    
    // Format the data for visualization
    return result.rows.map((row: any) => ({
      page: getPageTitleFromPath(row.path || ''),
      count: Number(row.exit_count)
    }));
  } catch (error) {
    console.error('Error getting exit pages data:', error);
    return [];
  }
}

export default router;