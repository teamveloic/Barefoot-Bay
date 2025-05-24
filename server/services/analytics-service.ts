// server/services/analytics-service.ts
import { Request } from 'express';
import { db } from '../db';
import { 
    analyticsSessions, 
    analyticsPageViews, 
    analyticsEvents,
    users // Make sure this is used or remove if not
} from '@shared/schema'; // Ensure this path is correct for your Drizzle schema
import geoip from 'geoip-lite';
import crypto from 'crypto';
import { and, asc, count, desc, eq, gte, or, sql } from 'drizzle-orm';

// Service for analytics operations
class AnalyticsService {

    /**
     * Start a new analytics session.
     * This method is called by the analyticsMiddleware when no existing session is found.
     */
    public async startSession(data: {
        userId: number | null | undefined;
        ipAddress: string;
        userAgent: string;
        deviceType: string;
        browser: string;
        referrer: string | null;
        entryPage: string;
        properties: {
            screen?: { width: string | string[] | undefined, height: string | string[] | undefined };
            language?: string | string[] | undefined;
        };
    }): Promise<string> {
        try {
            const newSessionId = crypto.randomUUID();
            const now = new Date();
            const os = this.detectOperatingSystem(data.userAgent); // Uses existing private method
            let geoData = data.ipAddress ? geoip.lookup(data.ipAddress) : null;

            if (!geoData && process.env.NODE_ENV !== 'production') {
                console.log('[AnalyticsService] Using fallback geo location for startSession');
                geoData = {
                    range: [0, 0], country: 'US', region: 'FL', eu: '0',
                    timezone: 'America/New_York', city: 'Orlando',
                    ll: [28.5383, -81.3792], metro: 0, area: 0
                };
            }

            await db.insert(analyticsSessions).values({
                sessionId: newSessionId,
                userId: data.userId,
                ip: data.ipAddress || 'unknown',
                userAgent: data.userAgent || 'unknown',
                device: data.deviceType,
                browser: data.browser,
                os: os,
                country: geoData?.country || null,
                region: geoData?.region || null,
                city: geoData?.city || null,
                latitude: geoData?.ll ? geoData.ll[0] : null,
                longitude: geoData?.ll ? geoData.ll[1] : null,
                startTimestamp: now,
                endTimestamp: now, 
                pagesViewed: 0, 
                isActive: true,
                referrer: data.referrer,
                entryPage: data.entryPage,
                // customDimensions: data.properties // Optional: consider if you want to store these initial properties
            });

            console.log(`[AnalyticsService] New session started: ${newSessionId}`);
            return newSessionId;

        } catch (error) {
            console.error('Error in AnalyticsService.startSession:', error);
            throw error; 
        }
    }

    /**
     * Track a new page view
     */
    async trackPageView(req: Request, data: any) { // `data` here is what analyticsMiddleware passes
        try {
            const sessionId = await this.getOrCreateSession(req); 

            const userAgent = (req && req.headers) ? req.headers['user-agent'] as string : 'unknown';
            const ip = this.getClientIp(req); 
            const userId = req.user?.id || null;

            const pageViewData = {
                sessionId,
                userId,
                ip,
                userAgent,
                path: (data && data.url) ? data.url : (req && req.url) ? req.url : '/', 
                referrer: (data && data.properties?.referrer) || (req && req.headers && req.headers.referer) || null, 
                pageType: (data && data.properties?.pageType) || 'page', 
                pageCategory: (data && data.properties?.pageCategory) || 'uncategorized', 
                timestamp: new Date(),
                customDimensions: (data && data.properties) || {} 
            };

            await db.update(analyticsSessions)
                .set({ 
                    pagesViewed: sql`pages_viewed + 1`,
                    isActive: true, 
                    endTimestamp: new Date() 
                })
                .where(eq(analyticsSessions.sessionId, sessionId));

            const [pageView] = await db.insert(analyticsPageViews)
                .values(pageViewData)
                .returning();

            return { sessionId, pageViewId: pageView.id };
        } catch (error) {
            console.error('Error tracking page view:', error);
            throw error;
        }
    }

    /**
     * Track a user event
     */
    async trackEvent(req: Request, data: any) {
        try {
            const sessionId = await this.getOrCreateSession(req);
            const ip = this.getClientIp(req);
            const userAgent = req.headers['user-agent'] as string;
            const userId = req.user?.id || null;

            const eventData = {
                sessionId,
                userId,
                eventType: data.eventType,
                category: data.eventCategory || this.getCategoryForEventType(data.eventType),
                action: data.eventAction || 'interaction',
                label: data.eventLabel || '',
                value: data.eventValue || null,
                path: data.path || req.path,
                timestamp: new Date(),
                eventData: data.properties || {},
                positionData: data.positionData || {}
            };

            await db.update(analyticsSessions)
                .set({ 
                    endTimestamp: new Date(),
                    isActive: true 
                })
                .where(eq(analyticsSessions.sessionId, sessionId));

            const [event] = await db.insert(analyticsEvents)
                .values(eventData)
                .returning();

            return { sessionId, eventId: event.id };
        } catch (error) {
            console.error('Error tracking event:', error);
            throw error;
        }
    }

    /**
     * End session tracking
     */
    async endSession(req: Request) {
        try {
            const sessionId = req.cookies['analytics_session_id'];

            if (sessionId) {
                const [session] = await db.select({
                    startTime: analyticsSessions.startTimestamp
                })
                .from(analyticsSessions)
                .where(eq(analyticsSessions.sessionId, sessionId));

                const endTime = new Date();
                let duration = null;

                if (session?.startTime) {
                    duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
                }

                await db.update(analyticsSessions)
                    .set({ 
                        endTimestamp: endTime,
                        duration: duration,
                        isActive: false
                    })
                    .where(eq(analyticsSessions.sessionId, sessionId));

                return { success: true, sessionId, duration };
            }

            return { success: false, message: 'No active session found' };
        } catch (error) {
            console.error('Error ending session:', error);
            throw error;
        }
    }

    /**
     * Get dashboard data
     */
    async getDashboardData(days: number = 30, liveDataOnly: boolean = false) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            console.log(`[Analytics] Getting dashboard data for ${days} days, liveDataOnly: ${liveDataOnly}`);

            const sessionsResult = await db.select({
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsSessions.startTimestamp, startDate)
            );

            const totalSessions = sessionsResult[0]?.count || 0;

            const uniqueVisitorsResult = await db.select({
                count: count(sql`DISTINCT ${analyticsSessions.ip}`),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsSessions.startTimestamp, startDate)
            );

            const uniqueVisitors = uniqueVisitorsResult[0]?.count || 0;

            const authenticatedUsersResult = await db.select({
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.userId} IS NOT NULL`,
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.userId} IS NOT NULL`
                        )
            );

            const authenticatedUsers = authenticatedUsersResult[0]?.count || 0;
            const anonymousUsers = totalSessions - authenticatedUsers;

            const pageViewsResult = await db.select({
                count: count(analyticsPageViews.id),
            })
            .from(analyticsPageViews)
            .leftJoin(analyticsSessions, eq(analyticsPageViews.sessionId, analyticsSessions.sessionId))
            .where(
                liveDataOnly
                    ? and(
                        gte(analyticsPageViews.timestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsPageViews.timestamp, startDate)
            );

            const totalPageViews = pageViewsResult[0]?.count || 0;

            const topPagesResult = await db.select({
                path: analyticsPageViews.path,
                pageType: analyticsPageViews.pageType,
                views: count(analyticsPageViews.id),
            })
            .from(analyticsPageViews)
            .leftJoin(analyticsSessions, eq(analyticsPageViews.sessionId, analyticsSessions.sessionId))
            .where(
                liveDataOnly
                    ? and(
                        gte(analyticsPageViews.timestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsPageViews.timestamp, startDate)
            )
            .groupBy(analyticsPageViews.path, analyticsPageViews.pageType)
            .orderBy(desc(count(analyticsPageViews.id)))
            .limit(10);

            const deviceResult = await db.select({
                device: analyticsSessions.device,
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsSessions.startTimestamp, startDate)
            )
            .groupBy(analyticsSessions.device)
            .orderBy(desc(count(analyticsSessions.id)));

            const browserResult = await db.select({
                browser: analyticsSessions.browser,
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsSessions.startTimestamp, startDate)
            )
            .groupBy(analyticsSessions.browser)
            .orderBy(desc(count(analyticsSessions.id)));

            const osResult = await db.select({
                os: analyticsSessions.os,
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsSessions.startTimestamp, startDate)
            )
            .groupBy(analyticsSessions.os)
            .orderBy(desc(count(analyticsSessions.id)));

            const countryResult = await db.select({
                country: analyticsSessions.country,
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly 
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsSessions.startTimestamp, startDate)
            )
            .groupBy(analyticsSessions.country)
            .orderBy(desc(count(analyticsSessions.id)));

            const eventsResult = await db.select({
                count: count(analyticsEvents.id),
            })
            .from(analyticsEvents)
            .leftJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.sessionId))
            .where(
                liveDataOnly
                    ? and(
                        gte(analyticsEvents.timestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsEvents.timestamp, startDate)
            );

            const totalEvents = eventsResult[0]?.count || 0;

            const eventsByTypeResult = await db.select({
                type: analyticsEvents.eventType,
                count: count(analyticsEvents.id),
            })
            .from(analyticsEvents)
            .leftJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.sessionId))
            .where(
                liveDataOnly
                    ? and(
                        gte(analyticsEvents.timestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsEvents.timestamp, startDate)
            )
            .groupBy(analyticsEvents.eventType)
            .orderBy(desc(count(analyticsEvents.id)));

            const eventsByCategoryResult = await db.select({
                category: analyticsEvents.category,
                count: count(analyticsEvents.id),
            })
            .from(analyticsEvents)
            .leftJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.sessionId))
            .where(
                liveDataOnly
                    ? and(
                        gte(analyticsEvents.timestamp, startDate),
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : gte(analyticsEvents.timestamp, startDate)
            )
            .groupBy(analyticsEvents.category)
            .orderBy(desc(count(analyticsEvents.id)));

            const geoDataResult = await db.select({
                country: analyticsSessions.country,
                region: analyticsSessions.region,
                city: analyticsSessions.city,
                latitude: analyticsSessions.latitude,
                longitude: analyticsSessions.longitude,
                count: count(analyticsSessions.id),
            })
            .from(analyticsSessions)
            .where(
                liveDataOnly
                    ? and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.latitude} IS NOT NULL`,
                        sql`${analyticsSessions.longitude} IS NOT NULL`,
                        sql`${analyticsSessions.ip} NOT LIKE '127.%'`,
                        sql`${analyticsSessions.ip} != 'unknown'`,
                        sql`${analyticsSessions.ip} NOT LIKE '192.168.%'`,
                        sql`${analyticsSessions.ip} NOT LIKE '10.%'`
                        )
                    : and(
                        gte(analyticsSessions.startTimestamp, startDate),
                        sql`${analyticsSessions.latitude} IS NOT NULL`,
                        sql`${analyticsSessions.longitude} IS NOT NULL`
                        )
            )
            .groupBy(
                analyticsSessions.country,
                analyticsSessions.region,
                analyticsSessions.city,
                analyticsSessions.latitude,
                analyticsSessions.longitude
            )
            .orderBy(desc(count(analyticsSessions.id)));

            return {
                timeRange: {
                    startDate: startDate.toISOString(),
                    endDate: new Date().toISOString(),
                    days,
                },
                sessions: {
                    total: totalSessions,
                    uniqueVisitors,
                    userTypes: { authenticated: authenticatedUsers, anonymous: anonymousUsers },
                    byDevice: deviceResult,
                    byBrowser: browserResult,
                    byOS: osResult,
                    byCountry: countryResult,
                },
                pageViews: {
                    total: totalPageViews,
                    topPages: topPagesResult,
                },
                events: {
                    total: totalEvents,
                    byType: eventsByTypeResult,
                    byCategory: eventsByCategoryResult,
                },
                location: {
                    geoData: geoDataResult,
                },
                traffic: {
                    byDay: await this.getDailyTrafficData(startDate, liveDataOnly),
                    pageViewsByDay: await this.getDailyPageViewsData(startDate, liveDataOnly),
                },
            };
        } catch (error) {
            console.error('Error getting dashboard data:', error);
            throw error;
        }
    }

    /**
     * Get active users data
     */
    async getActiveUsers() {
        try {
            const fifteenMinutesAgo = new Date();
            fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);

            const activeSessions = await db.select({
                id: analyticsSessions.id, sessionId: analyticsSessions.sessionId, userId: analyticsSessions.userId,
                device: analyticsSessions.device, browser: analyticsSessions.browser, os: analyticsSessions.os,
                country: analyticsSessions.country, city: analyticsSessions.city,
                latitude: analyticsSessions.latitude, longitude: analyticsSessions.longitude,
                startTimestamp: analyticsSessions.startTimestamp, endTimestamp: analyticsSessions.endTimestamp,
            })
            .from(analyticsSessions)
            .where(and(
                or(
                    gte(analyticsSessions.startTimestamp, fifteenMinutesAgo),
                    gte(analyticsSessions.endTimestamp, fifteenMinutesAgo)
                ),
                eq(analyticsSessions.isActive, true)
            ))
            .orderBy(desc(analyticsSessions.startTimestamp))
            .limit(50);

            const activeUsers = await Promise.all(activeSessions.map(async (session) => {
                const [lastPageView] = await db.select({
                    path: analyticsPageViews.path,
                    pageType: analyticsPageViews.pageType,
                    pageCategory: analyticsPageViews.pageCategory,
                })
                .from(analyticsPageViews)
                .where(sql`${analyticsPageViews.sessionId} = ${session.sessionId}`)
                .orderBy(desc(analyticsPageViews.timestamp))
                .limit(1);

                let user = null;
                if (session.userId) {
                    const [userData] = await db.select({
                        id: users.id, username: users.username, fullName: users.fullName,
                    })
                    .from(users)
                    .where(eq(users.id, session.userId));
                    user = userData || null;
                }

                return {
                    sessionId: session.sessionId, user, device: session.device, browser: session.browser, os: session.os,
                    location: { country: session.country || 'Unknown', city: session.city || 'Unknown', latitude: session.latitude, longitude: session.longitude },
                    startTime: session.startTimestamp.toISOString(), endTime: session.endTimestamp ? session.endTimestamp.toISOString() : null,
                    currentPage: lastPageView ? { path: lastPageView.path, pageType: lastPageView.pageType, pageCategory: lastPageView.pageCategory } : { path: 'Unknown', pageType: 'Unknown', pageCategory: 'Unknown' },
                };
            }));

            return {
                count: activeUsers.length,
                users: activeUsers,
            };
        } catch (error) {
            console.error('Error getting active users:', error);
            throw error;
        }
    }

    /**
     * Get user journey data
     */
    async getUserJourneyData(journeyType: string, days: number = 30, liveDataOnly: boolean = false) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            switch (journeyType) {
                case 'entryPages': {
                    console.log(`[Analytics] Getting entry pages for ${days} days, liveDataOnly: ${liveDataOnly}`);
                    const result = await db.execute(sql`
                        WITH first_pageviews AS (
                            SELECT 
                                pv.id, pv.path, pv.page_type, pv.page_category, pv.session_id,
                                ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.timestamp ASC) as rn
                            FROM analytics_page_views pv
                            JOIN analytics_sessions s ON pv.session_id = s.session_id
                            WHERE s.start_timestamp >= ${startDate}
                            ${liveDataOnly ? sql`AND (s.ip NOT LIKE '127.%' AND s.ip != 'unknown' AND s.ip NOT LIKE '192.168.%' AND s.ip NOT LIKE '10.%')` : sql``}
                        )
                        SELECT 
                            path, page_type, page_category, COUNT(*) as count
                        FROM first_pageviews
                        WHERE rn = 1
                        GROUP BY path, page_type, page_category
                        ORDER BY count DESC
                        LIMIT 20
                    `);
                    return result.rows.map(row => ({
                        path: row.path, pageType: row.page_type, pageCategory: row.page_category, count: Number(row.count),
                    }));
                }

                case 'exitPages': {
                    console.log(`[Analytics] Getting exit pages for ${days} days, liveDataOnly: ${liveDataOnly}`);
                    const result = await db.execute(sql`
                        WITH last_pageviews AS (
                            SELECT 
                                pv.id, pv.path, pv.page_type, pv.page_category, pv.session_id,
                                ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.timestamp DESC) as rn
                            FROM analytics_page_views pv
                            JOIN analytics_sessions s ON pv.session_id = s.session_id
                            WHERE s.start_timestamp >= ${startDate}
                            ${liveDataOnly ? sql`AND (s.ip NOT LIKE '127.%' AND s.ip != 'unknown' AND s.ip NOT LIKE '192.168.%' AND s.ip NOT LIKE '10.%')` : sql``}
                        )
                        SELECT 
                            path, page_type, page_category, COUNT(*) as count
                        FROM last_pageviews
                        WHERE rn = 1
                        GROUP BY path, page_type, page_category
                        ORDER BY count DESC
                        LIMIT 20
                    `);
                    return result.rows.map(row => ({
                        path: row.path, pageType: row.page_type, pageCategory: row.page_category, count: Number(row.count),
                    }));
                }

                case 'pathTransitions': {
                    console.log(`[Analytics] Getting path transitions for ${days} days, liveDataOnly: ${liveDataOnly}`);
                    const result = await db.execute(sql`
                        WITH page_paths AS (
                            SELECT
                                pv1.path AS source_path, pv1.page_type AS source_page_type, pv1.page_category AS source_page_category,
                                pv2.path AS target_path, pv2.page_type AS target_page_type, pv2.page_category AS target_page_category,
                                pv1.session_id
                            FROM analytics_page_views pv1
                            JOIN analytics_page_views pv2 ON 
                                pv1.session_id = pv2.session_id AND
                                pv1.timestamp < pv2.timestamp
                            JOIN analytics_sessions s ON pv1.session_id = s.session_id
                            WHERE 
                                s.start_timestamp >= ${startDate}
                                ${liveDataOnly ? sql`AND (s.ip NOT LIKE '127.%' AND s.ip != 'unknown' AND s.ip NOT LIKE '192.168.%' AND s.ip NOT LIKE '10.%')` : sql``}
                                AND pv2.timestamp = (
                                    SELECT MIN(pv3.timestamp)
                                    FROM analytics_page_views pv3
                                    WHERE 
                                        pv3.session_id = pv1.session_id AND
                                        pv3.timestamp > pv1.timestamp
                                )
                        )
                        SELECT
                            source_path, source_page_type, source_page_category, 
                            target_path, target_page_type, target_page_category,
                            COUNT(*) as transitions
                        FROM page_paths
                        GROUP BY 
                            source_path, source_page_type, source_page_category, 
                            target_path, target_page_type, target_page_category
                        ORDER BY transitions DESC
                        LIMIT 30
                    `);

                    const nodes: { id: string; pageType: string; pageCategory: string }[] = [];
                    const links: { source: string; target: string; value: number }[] = [];
                    const nodeIds = new Set<string>();

                    result.rows.forEach(row => {
                        const sourcePath = row.source_path as string;
                        const targetPath = row.target_path as string;

                        if (!nodeIds.has(sourcePath)) {
                            nodes.push({ 
                                id: sourcePath, 
                                pageType: row.source_page_type as string || 'unknown',
                                pageCategory: row.source_page_category as string || 'unknown'
                            });
                            nodeIds.add(sourcePath);
                        }

                        if (!nodeIds.has(targetPath)) {
                            nodes.push({ 
                                id: targetPath, 
                                pageType: row.target_page_type as string || 'unknown',
                                pageCategory: row.target_page_category as string || 'unknown'
                            });
                            nodeIds.add(targetPath);
                        }

                        links.push({
                            source: sourcePath,
                            target: targetPath,
                            value: Number(row.transitions)
                        });
                    });

                    return { nodes, links };
                }

                default:
                    throw new Error(`Invalid journey type: ${journeyType}`);
            }
        } catch (error) {
            console.error(`Error getting user journey data for type ${journeyType}:`, error);
            throw error;
        }
    }

    /**
     * Get or create a session for tracking
     */
    private async getOrCreateSession(req: Request): Promise<string> {
        let sessionId = req.cookies?.['analytics_session_id'];

        if (sessionId) {
            const [session] = await db.select()
                .from(analyticsSessions)
                .where(eq(analyticsSessions.sessionId, sessionId));

            if (session) {
                return sessionId;
            }
        }

        const userAgent = (req && req.headers) ? req.headers['user-agent'] as string : 'unknown';
        const device = this.detectDeviceType(userAgent);
        const browser = this.detectBrowser(userAgent);
        const os = this.detectOperatingSystem(userAgent);

        const ip = this.getClientIp(req);
        let geoData = ip ? geoip.lookup(ip) : null;

        if (!geoData && process.env.NODE_ENV !== 'production') {
            console.log('[Analytics] Using fallback geo location for testing');
            geoData = {
                range: [0, 0], country: 'US', region: 'FL', eu: '0',
                timezone: 'America/New_York', city: 'Orlando',
                ll: [28.5383, -81.3792], metro: 0, area: 0
            };
        }

        const userId = req.user?.id || null;
        const newSessionId = crypto.randomUUID();

        await db.insert(analyticsSessions)
            .values({
                sessionId: newSessionId, userId, ip: ip || 'unknown', userAgent: userAgent || 'unknown',
                device, browser, os,
                country: geoData?.country || null, region: geoData?.region || null, city: geoData?.city || null,
                latitude: geoData?.ll ? geoData.ll[0] : null, longitude: geoData?.ll ? geoData.ll[1] : null,
                startTimestamp: new Date(), pagesViewed: 1, // Start pagesViewed at 1 for the first page view
                isActive: true,
                // referrer and entryPage should be set by the first trackPageView or by startSession if it were more complex
            })
            .returning();

        if (req.res) {
            req.res.cookie('analytics_session_id', newSessionId, {
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
            });
        }

        return newSessionId;
    }

    /**
     * Detect operating system from user agent
     */
    private detectOperatingSystem(userAgent: string): string {
        if (!userAgent) return 'Unknown';
        userAgent = userAgent.toLowerCase();
        if (userAgent.includes('windows')) return 'Windows';
        if (userAgent.includes('mac os x') || userAgent.includes('macintosh')) return 'macOS';
        if (userAgent.includes('ipad') || userAgent.includes('iphone') || userAgent.includes('ipod')) return 'iOS';
        if (userAgent.includes('android')) return 'Android';
        if (userAgent.includes('linux')) return 'Linux';
        return 'Other';
    }

    /**
     * Get the client IP address
     */
    private getClientIp(req: Request): string | null {
        if (!req || !req.headers) {
            return null;
        }
        const forwardedFor = req.headers['x-forwarded-for'];
        if (forwardedFor) {
            return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0]).trim();
        }
        if (req.headers['x-real-ip']) {
            return req.headers['x-real-ip'] as string;
        }
        return req.ip || null;
    }

    /**
     * Detect device type from user agent
     * Always returns either 'mobile', 'tablet', or 'desktop' - never 'unknown'
     */
    private detectDeviceType(userAgent: string): string {
        if (!userAgent) return 'desktop'; 
        userAgent = userAgent.toLowerCase();
        const mobileKeywords = [
            'iphone', 'ipod', 'android.*mobile', 'windows.*phone', 'blackberry',
            '\\bsymbian\\b', 'series60', 'series40', 'bb10', 'meego', 'webos',
            'palm', 'opera mini', 'opera mobi', 'fennec', 'mobile safari',
            'samsung.*mobile', 'nokia', 'bolt', 'netfront', 'skyfire', 'midp',
            'wap.*browser', 'profile\\/midp', 'ucweb', 'mobile', '\\bmob', 'smartphone',
            'htc', 'lg-', 'sony', 'xiaomi', 'huawei', 'vivo', 'oppo', 'alcatel'
        ];
        for (const keyword of mobileKeywords) {
            if (userAgent.match(new RegExp(keyword, 'i'))) {
                return 'mobile';
            }
        }
        const tabletKeywords = [
            'ipad', 'tablet', 'kindle', 'playbook', 'nexus 7', 'nexus 9', 'nexus 10',
            'android(?!.*mobile)', 'silk', 'surface'
        ];
        for (const keyword of tabletKeywords) {
            if (userAgent.match(new RegExp(keyword, 'i'))) {
                return 'tablet';
            }
        }
        if (userAgent.includes('headlesschrome')) {
            console.log('[Analytics] Detected headless browser, classifying as desktop');
            return 'desktop';
        }
        if (userAgent.match(/\(.*touch.*\)/i)) {
            return 'tablet';
        }
        return 'desktop';
    }

    /**
     * Detect browser from user agent
     */
    private detectBrowser(userAgent: string): string {
        if (!userAgent) return 'unknown';
        userAgent = userAgent.toLowerCase();
        if (userAgent.includes('edge') || userAgent.includes('edg')) {
            return 'Edge';
        } else if (userAgent.includes('chrome')) {
            return 'Chrome';
        } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
            return 'Safari';
        } else if (userAgent.includes('firefox')) {
            return 'Firefox';
        } else if (userAgent.includes('msie') || userAgent.includes('trident')) {
            return 'Internet Explorer';
        } else {
            return 'Unknown';
        }
    }

    /**
     * Get daily traffic data by counting sessions per day
     */
    private async getDailyTrafficData(startDate: Date, liveDataOnly: boolean = false) {
        try {
            console.log(`[Analytics] Getting daily traffic data since ${startDate.toISOString()}, liveDataOnly: ${liveDataOnly}`);
            const result = await db.execute(sql`
                SELECT 
                    DATE_TRUNC('day', start_timestamp) AS day,
                    COUNT(*) AS sessions,
                    COUNT(DISTINCT ip) AS unique_visitors
                FROM analytics_sessions
                WHERE start_timestamp >= ${startDate}
                ${liveDataOnly ? sql`AND (ip NOT LIKE '127.%' AND ip != 'unknown' AND ip NOT LIKE '192.168.%' AND ip NOT LIKE '10.%')` : sql``}
                GROUP BY DATE_TRUNC('day', start_timestamp)
                ORDER BY day ASC
            `);

            return result.rows.map(row => {
                let dateStr = 'unknown';
                try {
                    if (row.day) {
                        dateStr = new Date(String(row.day)).toISOString().split('T')[0];
                    }
                } catch (e) {
                    console.error('Error parsing date:', e);
                }

                return {
                    date: dateStr,
                    sessions: Number(row.sessions),
                    uniqueVisitors: Number(row.unique_visitors)
                };
            });
        } catch (error) {
            console.error('Error getting daily traffic data:', error);
            return [];
        }
    }

    /**
     * Get daily page views data by counting page views per day
     */
    private async getDailyPageViewsData(startDate: Date, liveDataOnly: boolean = false) {
        try {
            console.log(`[Analytics] Getting daily page views data since ${startDate.toISOString()}, liveDataOnly: ${liveDataOnly}`);
            const result = await db.execute(sql`
                SELECT 
                    DATE_TRUNC('day', pv.timestamp) AS day,
                    COUNT(*) AS page_views
                FROM analytics_page_views pv
                ${liveDataOnly ? sql`
                JOIN analytics_sessions s ON pv.session_id = s.session_id
                WHERE 
                    pv.timestamp >= ${startDate}
                    AND (s.ip NOT LIKE '127.%' AND s.ip != 'unknown' AND s.ip NOT LIKE '192.168.%' AND s.ip NOT LIKE '10.%')
                ` : sql`
                WHERE pv.timestamp >= ${startDate}
                `}
                GROUP BY DATE_TRUNC('day', pv.timestamp)
                ORDER BY day ASC
            `);

            return result.rows.map(row => {
                let dateStr = 'unknown';
                try {
                    if (row.day) {
                        dateStr = new Date(String(row.day)).toISOString().split('T')[0];
                    }
                } catch (e) {
                    console.error('Error parsing date:', e);
                }

                return {
                    date: dateStr,
                    pageViews: Number(row.page_views)
                };
            });
        } catch (error) {
            console.error('Error getting daily page views data:', error);
            return [];
        }
    }

    /**
     * Helper to map event types to categories
     */
    private getCategoryForEventType(eventType: string): string {
        const categoryMap: Record<string, string> = {
            'click': 'user_interaction', 'view': 'content', 'scroll': 'user_engagement',
            'search': 'search', 'form_submit': 'conversion', 'signup': 'conversion',
            'login': 'auth', 'logout': 'auth', 'purchase': 'ecommerce',
        };
        return categoryMap[eventType] || 'other';
    }
} // End of AnalyticsService class

export const analyticsService = new AnalyticsService();