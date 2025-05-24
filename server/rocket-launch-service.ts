import fetch from 'node-fetch';

interface RocketLaunchResponse {
  result: {
    id: string;
    name: string;
    provider: {
      name: string;
    };
    vehicle: {
      name: string;
    };
    pad: {
      name: string;
      location: {
        name: string;
        state?: string;
      };
    };
    missions: {
      name: string;
      description: string;
    }[];
    win_open: string | null;
    win_close: string | null;
    t0: string | null;
    est_date: {
      month: number | null;
      day: number | null;
      year: number | null;
      quarter: number | null;
    } | null;
    launch_description: string | null;
    weather_concerns: string | null;
    weather_temp: number | null;
    weather_icon: string | null;
    quicktext: string | null;
    result?: number | null;   // -1: scrubbed, 0: failure, 1: success
    modified?: string | null; // Timestamp of when the launch data was last modified
    status?: string;          // Alternative status field in some API responses
    last_updated?: string;    // Alternative timestamp field in some API responses
    [key: string]: any;       // Allow for additional fields in the API response
  }[];
}

// Locations in Florida where rocket launches are typically visible from Barefoot Bay
const FLORIDA_LOCATIONS = [
  "Cape Canaveral", 
  "Kennedy Space Center",
  "Cape Canaveral Space Force Station",
  "Cape Canaveral SFS", // Add SFS abbreviation
  "Florida"
];

/**
 * Helper function to check if a launch appears to be rescheduled
 * This detects situations where the API still has result: -1 (scrubbed)
 * but the launch has a future time, suggesting it was rescheduled
 */
function isRescheduledLaunch(launch) {
  // First check if it's marked as scrubbed
  if (launch.result !== -1) return false;
  
  // Then check if it has a future launch time
  const launchTimeStr = launch.t0 || launch.win_open;
  if (!launchTimeStr) return false;
  
  // Compare with current time
  const launchTime = new Date(launchTimeStr).getTime();
  const currentTime = new Date().getTime();
  
  // If launch time is in the future (within 7 days), it's likely rescheduled
  return launchTime > currentTime && launchTime < currentTime + 7 * 24 * 60 * 60 * 1000;
}

export async function getUpcomingRocketLaunches() {
  try {
    // Use the free API endpoint that provides the next 5 launches
    const url = 'https://fdo.rocketlaunch.live/json/launches/next/5';
    
    console.log(`Fetching rocket launch data from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Error fetching rocket launch data: ${response.status}`);
      throw new Error(`Failed to fetch rocket launch data: ${response.status}`);
    }
    
    const data: RocketLaunchResponse = await response.json() as RocketLaunchResponse;
    console.log(`Rocket launch API response:`, JSON.stringify(data, null, 2));
    
    if (!data.result || !Array.isArray(data.result)) {
      console.error("Invalid data format received from RocketLaunch.Live API");
      return [];
    }
    
    // Filter for launches that are:
    // 1. Located in Florida (visible from Barefoot Bay)
    // Since the API only returns the next 5 launches, we don't need to filter by date
    const visibleLaunches = data.result.filter(launch => {
      // Check location - look for Florida in the location name or state
      const locationName = launch.pad?.location?.name || '';
      const locationState = launch.pad?.location?.state || '';
      
      const isFloridaLaunch = FLORIDA_LOCATIONS.some(location => 
        locationName.toLowerCase().includes(location.toLowerCase())
      ) || locationState === 'FL';
      
      // Enhanced logging to troubleshoot filtering issues
      console.log(`Launch ${launch.name} at ${locationName}, ${locationState}: is Florida launch? ${isFloridaLaunch}`);
      
      return isFloridaLaunch;
    });
    
    // Log raw data to troubleshoot
    console.log('Rocket launch raw data from API:', JSON.stringify(visibleLaunches.slice(0, 1), null, 2));
    
    // Map the API response to match our expected format
    return visibleLaunches.map(launch => {
      // Try to get the most precise launch date available
      let formattedDate = null;
      let padTime = null;
      
      // Always use t0 as the official pad launch time when available
      if (launch.t0) {
        padTime = launch.t0;
        formattedDate = launch.t0; // Default to using t0 for window_start too
      }
      // Fallback to win_open if t0 is not available
      else if (launch.win_open) {
        formattedDate = launch.win_open;
      } 
      // As a last resort, if we have est_date with month/day/year, create a date
      else if (launch.est_date && launch.est_date.year && launch.est_date.month && launch.est_date.day) {
        // For estimated dates, use 4:00 PM UTC as the default time
        const month = launch.est_date.month;
        const day = launch.est_date.day;
        const year = launch.est_date.year;
        formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T16:00:00Z`;
      }
      
      // Check for the result field in the API response - look for 'result' or 'status' field
      let launchResult = null;
      if ('result' in launch) {
        console.log(`Launch ${launch.name} has result field: ${launch.result}`);
        launchResult = launch.result;
        
        // Use our helper function to detect if this is a rescheduled launch
        if (isRescheduledLaunch(launch)) {
          console.log(`Launch ${launch.name} appears to be rescheduled (has scrubbed result but future launch time)`);
          // Override the scrubbed status for rescheduled launches
          launchResult = null;
        }
      } else if ('status' in launch) {
        console.log(`Launch ${launch.name} has status field: ${launch.status}`);
        launchResult = launch.status === 'scrubbed' ? -1 : null;
      }
      
      // Check for the modified timestamp in the API response
      let modifiedTimestamp = null;
      if ('modified' in launch) {
        console.log(`Launch ${launch.name} has modified timestamp: ${launch.modified}`);
        modifiedTimestamp = launch.modified;
      } else if ('last_updated' in launch) {
        console.log(`Launch ${launch.name} has last_updated timestamp: ${launch.last_updated}`);
        modifiedTimestamp = launch.last_updated;
      }
      
      // Extra debugging for specific launches we're tracking
      if (launch.name && (launch.name.includes('Kuiper') || launch.name.includes('Starlink'))) {
        console.log(`Enhanced debugging for ${launch.name}:`, {
          name: launch.name,
          result: launchResult,
          original_result: launch.result,
          modified: modifiedTimestamp,
          t0: launch.t0,
          win_open: launch.win_open,
          is_rescheduled: isRescheduledLaunch(launch),
          description: launch.launch_description?.substring(0, 100) // Truncate long descriptions
        });
        
        // Only mark as scrubbed if description contains "scrub" and not already detected as rescheduled or scrubbed
        if (launch.launch_description && 
            launch.launch_description.toLowerCase().includes('scrub') && 
            launchResult !== -1) {
          console.log(`Detected scrub in description for ${launch.name}, setting result to -1`);
          launchResult = -1;
        }
      }
      
      return {
        id: launch.id,
        name: launch.name,
        provider: launch.provider,
        vehicle: launch.vehicle,
        pad: launch.pad,
        missions: launch.missions,
        window_start: formattedDate,
        window_end: launch.win_close,
        pad_time: padTime,  // Include the official t0 pad time
        launch_description: launch.launch_description,
        est_date: launch.est_date,
        weather_concerns: launch.weather_concerns,
        weather_temp: launch.weather_temp,
        weather_condition: launch.weather_icon ? launch.weather_icon.replace(/-/g, ' ') : null,
        quicktext: launch.quicktext,
        result: launchResult,    // Use our detected result value
        modified: modifiedTimestamp  // Use our detected modified timestamp
      };
    });
  } catch (error) {
    console.error("Error in getUpcomingRocketLaunches:", error);
    throw error;
  }
}