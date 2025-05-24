import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getMediaUrl, handleImageError } from "@/lib/media-helper";
import { usePermissions } from "@/hooks/use-permissions";

interface RocketLaunchData {
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
  window_start: string | null;
  window_end: string | null;
  pad_time: string | null; // Official pad launch time (t0)
  launch_description: string | null;
  est_date?: {
    month: number | null;
    day: number | null;
    year: number | null;
    quarter: number | null;
  } | null;
  weather_concerns: string | null;
  weather_temp: number | null;
  weather_condition: string | null;
  quicktext: string | null;
  // Additional fields for status monitoring
  result: number | null; // -1: scrubbed, 0: failure, 1: success
  modified: string | null; // Timestamp of when the launch data was last modified
}

// Live countdown component for dynamic T-minus timer
interface LiveCountdownProps {
  launch: RocketLaunchData;
}

function LiveCountdown({ launch }: LiveCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    // Function to calculate and format time remaining
    const updateTimeRemaining = () => {
      try {
        // Prioritize the official pad time (t0) when available
        const launchTimeStr = launch.pad_time || launch.window_start;

        if (!launchTimeStr) {
          setTimeRemaining("Countdown unavailable");
          return;
        }

        // Debug the launch time data
        console.log("Countdown using launch time:", launchTimeStr);
        console.log(
          "Accurate pad local time:",
          new Date(launchTimeStr).toISOString(),
        );

        const launchDateTime = new Date(launchTimeStr).getTime();
        const currentTime = new Date().getTime();
        const timeDiffMs = launchDateTime - currentTime;

        // Debug time calculation
        console.log(
          `Accurate launch time: ${new Date(launchDateTime).toISOString()}, Current time: ${new Date(currentTime).toISOString()}, Diff (ms): ${timeDiffMs}`,
        );

        // The date is in the future, show countdown
        if (launchDateTime > currentTime) {
          // Calculate hours, minutes and seconds
          const hours = Math.floor(timeDiffMs / (1000 * 60 * 60));
          const minutes = Math.floor(
            (timeDiffMs % (1000 * 60 * 60)) / (1000 * 60),
          );
          const seconds = Math.floor((timeDiffMs % (1000 * 60)) / 1000);
          const tenths = Math.floor((timeDiffMs % 1000) / 100); // Add tenths for more precision

          // Format the countdown based on time remaining
          if (hours > 0) {
            setTimeRemaining(`T-${hours}h ${minutes}m ${seconds}s to launch`);
          } else if (minutes > 0) {
            setTimeRemaining(`T-${minutes}m ${seconds}s to launch`);
          } else if (seconds > 0) {
            // When seconds are low, show tenths of seconds for precision
            if (seconds < 10) {
              setTimeRemaining(`T-${seconds}.${tenths}s to launch`);
            } else {
              setTimeRemaining(`T-${seconds}s to launch`);
            }
          } else {
            setTimeRemaining(`Launch imminent!`);
          }
        }
        // Just passed launch time (within 10 minutes)
        else if (currentTime <= launchDateTime + 10 * 60 * 1000) {
          // Calculate how many seconds since launch
          const secondsSinceLaunch = Math.floor(Math.abs(timeDiffMs) / 1000);

          if (secondsSinceLaunch < 60) {
            setTimeRemaining(`T+${secondsSinceLaunch}s - Launch in progress!`);
          } else {
            const minutesSinceLaunch = Math.floor(secondsSinceLaunch / 60);
            const remainingSeconds = secondsSinceLaunch % 60;
            setTimeRemaining(
              `T+${minutesSinceLaunch}m ${remainingSeconds}s - Launch in progress!`,
            );
          }
        }
        // More than 10 minutes after launch but not for scrubbed launches
        else if (launch.result !== -1) {
          setTimeRemaining("Launch completed");
        }
        // For scrubbed launches, show appropriate message
        else {
          setTimeRemaining("Launch scrubbed");
        }
      } catch (err) {
        console.error("Error calculating time remaining:", err);
        setTimeRemaining("Countdown unavailable");
      }
    };

    // Update immediately and set interval
    updateTimeRemaining();

    // Determine update frequency based on time to launch
    let updateInterval = 1000; // Default 1 second
    try {
      const launchTimeStr = launch.pad_time || launch.window_start;
      if (launchTimeStr) {
        const launchDateTime = new Date(launchTimeStr).getTime();
        const currentTime = new Date().getTime();
        const diffMs = Math.abs(launchDateTime - currentTime);

        // Within 10 seconds of launch (before or after): update every 100ms for smoother countdown
        if (diffMs < 10000) {
          updateInterval = 100;
        }
      }
    } catch (e) {
      // Default to 1 second if there's an error
      updateInterval = 1000;
    }

    // Set interval with the determined frequency
    const intervalId = setInterval(updateTimeRemaining, updateInterval);

    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [launch]);

  return <div className="mt-1 text-red-600 font-semibold">{timeRemaining}</div>;
}

export function RocketLaunchViewer() {
  const { canSeeWeatherRocketIcons } = usePermissions();
  const [isLoading, setIsLoading] = useState(true);
  const [launchData, setLaunchData] = useState<RocketLaunchData | null>(null);
  const [previousLaunchData, setPreviousLaunchData] =
    useState<RocketLaunchData | null>(null);
  const [allLaunches, setAllLaunches] = useState<RocketLaunchData[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLaunchImminent, setIsLaunchImminent] = useState(false);
  const [launchStatusMessage, setLaunchStatusMessage] = useState<string | null>(
    null,
  );
  const [statusChange, setStatusChange] = useState<
    "delay" | "scrub" | "success" | "failure" | null
  >(null);
  
  // Preload the rocket icon to ensure it's available when needed
  useEffect(() => {
    // Preload rocket icon paths, using only local filesystem paths
    const preloadRocketIcon = () => {
      const iconPaths = [
        // Local files only
        '/icons/Asset1.svg',
        '/uploads/icons/Asset1.svg',
        '/icons/rocket-icon.svg',
        '/uploads/icons/rocket-icon.svg'
      ];
      
      console.log('Preloading rocket icons using filesystem paths');
      
      // Create hidden image elements to preload the icons
      iconPaths.forEach(path => {
        const img = new Image();
        img.src = path;
        img.onload = () => console.log(`Successfully preloaded: ${path}`);
        img.onerror = () => console.warn(`Failed to preload: ${path}`);
        img.style.display = 'none';
        
        // Use proper prefetching as well
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = path;
        link.as = 'image';
        document.head.appendChild(link);
      });
    };
    
    preloadRocketIcon();
  }, []);

  // Function to detect changes in launch status between API calls

  // Function to detect changes in launch status between API calls
  const detectLaunchStatusChanges = (
    previousData: RocketLaunchData,
    currentData: RocketLaunchData,
  ) => {
    console.log("Checking for launch status changes...");

    // Check for pad_time/t0 changes (launch time shifts)
    if (previousData.pad_time !== currentData.pad_time) {
      if (previousData.pad_time && currentData.pad_time) {
        console.log(
          `Launch time changed from ${previousData.pad_time} to ${currentData.pad_time}`,
        );

        // Format times for display
        const prevTime = new Date(previousData.pad_time);
        const newTime = new Date(currentData.pad_time);
        const diffMs = newTime.getTime() - prevTime.getTime();
        const diffMinutes = Math.round(diffMs / (60 * 1000));

        // Set appropriate message based on time change
        if (diffMinutes > 0) {
          setLaunchStatusMessage(
            `Launch delayed by ${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`,
          );
          setStatusChange("delay");
        } else if (diffMinutes < 0) {
          setLaunchStatusMessage(
            `Launch time moved up by ${Math.abs(diffMinutes)} minute${Math.abs(diffMinutes) !== 1 ? "s" : ""}`,
          );
          setStatusChange(null); // Not really a "status" change, just an advancement
        }
      } else if (previousData.pad_time && !currentData.pad_time) {
        // If pad_time was previously set but is now null
        setLaunchStatusMessage(
          "Launch time is now indefinite (possible scrub)",
        );
        setStatusChange("scrub");
      }
    }

    // Check for result field changes
    if (previousData.result !== currentData.result) {
      console.log(
        `Launch result changed from ${previousData.result} to ${currentData.result}`,
      );

      if (currentData.result === -1) {
        // Distinguish between scrub vs. delay based on t0/pad_time changes
        if (previousData.pad_time && !currentData.pad_time) {
          // If pad_time was set before but now is null, it's a scrub
          setLaunchStatusMessage("Launch has been scrubbed (cancelled)");
          setStatusChange("scrub");
          console.log("Launch detected as SCRUBBED: t0 became null");
        } else if (previousData.pad_time && currentData.pad_time) {
          // If pad_time changed to a later time, it's a delay
          const prevTime = new Date(previousData.pad_time).getTime();
          const newTime = new Date(currentData.pad_time).getTime();
          if (newTime > prevTime) {
            const diffMinutes = Math.round((newTime - prevTime) / (60 * 1000));
            setLaunchStatusMessage(
              `Launch delayed by ${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`,
            );
            setStatusChange("delay");
            console.log(
              `Launch detected as DELAYED: t0 pushed back by ${diffMinutes} minutes`,
            );
          } else {
            // Generic message if we can't determine specific delay pattern
            setLaunchStatusMessage("Launch status changed (possible delay)");
            setStatusChange("delay");
          }
        } else {
          // Generic message if we can't clearly determine
          setLaunchStatusMessage("Launch has been scrubbed or delayed");
          setStatusChange("scrub");
        }
      } else if (currentData.result === 0) {
        setLaunchStatusMessage("Launch failed");
        setStatusChange("failure");
        console.log("Launch detected as FAILED (result=0)");
      } else if (currentData.result === 1) {
        setLaunchStatusMessage("Launch successful!");
        setStatusChange("success");
        console.log("Launch detected as SUCCESSFUL (result=1)");
      }
    }

    // Check for modified timestamp changes
    if (previousData.modified !== currentData.modified) {
      console.log(`Launch data modified at ${currentData.modified}`);

      // Check if description or quicktext contains keywords about delays/scrubs
      const delayKeywords = [
        "delay",
        "scrub",
        "postpone",
        "reschedule",
        "hold",
        "canceled",
      ];

      // Check description for delay keywords
      if (
        currentData.launch_description &&
        previousData.launch_description !== currentData.launch_description &&
        delayKeywords.some((keyword) =>
          currentData.launch_description?.toLowerCase().includes(keyword),
        )
      ) {
        setLaunchStatusMessage(
          "Launch status updated: Possible delay or scrub",
        );
        setStatusChange("delay");
      }

      // Check quicktext for delay keywords
      if (
        currentData.quicktext &&
        previousData.quicktext !== currentData.quicktext &&
        delayKeywords.some((keyword) =>
          currentData.quicktext?.toLowerCase().includes(keyword),
        )
      ) {
        setLaunchStatusMessage(
          "Launch status updated: Possible delay or scrub",
        );
        setStatusChange("delay");
      }
    }
  };

  // Check initial launch status before detecting changes
  useEffect(() => {
    if (!launchData) return;

    // If the launch data already has result info, set the status even without a change detection
    if (launchData.result !== null && statusChange === null) {
      console.log(`Initial launch status check: result=${launchData.result}`);

      if (launchData.result === -1) {
        // For initial -1 result, we can't compare to previous data, so use a generic message
        setLaunchStatusMessage("Launch has been scrubbed or delayed");
        setStatusChange("scrub");
        console.log("Initial status: Launch is scrubbed or delayed");
      } else if (launchData.result === 0) {
        setLaunchStatusMessage("Launch failed");
        setStatusChange("failure");
        console.log("Initial status: Launch failed");
      } else if (launchData.result === 1) {
        setLaunchStatusMessage("Launch successful!");
        setStatusChange("success");
        console.log("Initial status: Launch successful");
      }
    }
  }, [launchData]);

  // Helper function to check if a launch is within the imminent window (1 hour before to 10 min after)
  const checkLaunchImminent = (launchData: RocketLaunchData | null) => {
    // If no launch data, not imminent
    if (!launchData) return false;

    try {
      // Prioritize using the official pad time (t0) when available
      const launchTimeStr = launchData.pad_time || launchData.window_start;

      // If no valid launch time is found, not imminent
      if (!launchTimeStr) return false;

      const launchTime = new Date(launchTimeStr).getTime();
      const currentTime = new Date().getTime();
      const oneHourMs = 60 * 60 * 1000; // 1 hour in milliseconds
      const tenMinutesMs = 10 * 60 * 1000; // 10 minutes in milliseconds

      // Log accurate time information for debugging
      console.log(
        `Using official pad time: ${launchTimeStr} for imminent check`,
      );
      console.log(
        `Current time: ${new Date(currentTime).toISOString()}, Launch time: ${new Date(launchTime).toISOString()}`,
      );
      console.log(
        `Time difference: ${Math.floor((launchTime - currentTime) / 60000)} minutes`,
      );

      // For scrubbed launches, show the amber indicator only for 1 hour after it was announced
      if (launchData.result === -1) {
        console.log(`Launch ${launchData.name} is SCRUBBED (result = -1)`);

        // Only show indicator for 1 hour after scrub announcement
        if (launchData.modified) {
          const scrubAnnouncedTime = new Date(launchData.modified).getTime();
          const oneHourAfterScrubMs = scrubAnnouncedTime + oneHourMs;
          const shouldShowIndicator = currentTime <= oneHourAfterScrubMs;

          console.log(
            `Current time: ${new Date(currentTime).toISOString()}, Scrub announced: ${new Date(scrubAnnouncedTime).toISOString()}`,
          );
          console.log(
            `Time since scrub: ${Math.floor((currentTime - scrubAnnouncedTime) / 60000)} minutes, Show indicator: ${shouldShowIndicator}`,
          );

          return shouldShowIndicator;
        }

        // If no modified timestamp is available, default to showing for safety
        return true;
      }

      // Launch is imminent if:
      // 1. Current time is between 1 hour before launch and the launch time, OR
      // 2. Current time is within 10 minutes after the launch time
      return (
        (currentTime >= launchTime - oneHourMs && currentTime <= launchTime) ||
        (currentTime > launchTime && currentTime <= launchTime + tenMinutesMs)
      );
    } catch (err) {
      console.error("Error checking if launch is imminent:", err);
      return false;
    }
  };

  // Effect to check and update if the launch is imminent
  useEffect(() => {
    if (!launchData) {
      setIsLaunchImminent(false);
      return;
    }

    // Helper function to determine check frequency
    const getCheckFrequency = () => {
      const launchTimeStr = launchData.pad_time || launchData.window_start;
      if (!launchTimeStr) return 30 * 1000; // Default 30 seconds

      try {
        const launchTime = new Date(launchTimeStr).getTime();
        const currentTime = new Date().getTime();
        const diffMs = Math.abs(launchTime - currentTime);

        // Check more frequently the closer we get to launch time
        // Within 10 minutes: check every 10 seconds
        if (diffMs < 10 * 60 * 1000) return 10 * 1000;
        // Within 30 minutes: check every 20 seconds
        if (diffMs < 30 * 60 * 1000) return 20 * 1000;
        // Otherwise check every 30 seconds
        return 30 * 1000;
      } catch (err) {
        return 30 * 1000; // Default to 30 seconds if there's an error
      }
    };

    // Check initially if launch is imminent
    setIsLaunchImminent(checkLaunchImminent(launchData));

    // Set up initial interval
    let checkFrequency = getCheckFrequency();
    let checkIntervalId = setInterval(() => {
      setIsLaunchImminent(checkLaunchImminent(launchData));

      // Dynamically adjust check frequency
      const newFrequency = getCheckFrequency();
      if (newFrequency !== checkFrequency) {
        clearInterval(checkIntervalId);
        checkFrequency = newFrequency;
        checkIntervalId = setInterval(() => {
          setIsLaunchImminent(checkLaunchImminent(launchData));
        }, checkFrequency);
      }
    }, checkFrequency);

    return () => clearInterval(checkIntervalId);
  }, [launchData]);

  useEffect(() => {
    const fetchLaunchData = async () => {
      try {
        setIsLoading(true);
        // The API endpoint to fetch launch data from the backend
        const response = await fetch("/api/rocket-launches");

        if (!response.ok) {
          throw new Error(`Failed to fetch launch data: ${response.status}`);
        }

        const data = await response.json();
        console.log("Rocket launch data received:", data);

        if (data && data.length > 0) {
          // Log complete launch data for debugging
          console.log("First launch window_start:", data[0].window_start);
          console.log(
            "First launch date object:",
            new Date(data[0].window_start),
          );
          console.log("Current date object:", new Date());
          console.log(
            "Is future date?",
            new Date(data[0].window_start) > new Date(),
          );

          // Log detailed information for Kuiper KA-01 if present
          const kuiperLaunch = data.find(
            (launch: RocketLaunchData) =>
              launch.name && launch.name.includes("Kuiper"),
          );
          if (kuiperLaunch) {
            console.log("Kuiper KA-01 launch details:", {
              id: kuiperLaunch.id,
              name: kuiperLaunch.name,
              result: kuiperLaunch.result,
              window_start: kuiperLaunch.window_start,
              pad_time: kuiperLaunch.pad_time,
              description: kuiperLaunch.launch_description,
              modified: kuiperLaunch.modified,
            });

            // Check if the description indicates a scrub but result field doesn't
            if (
              kuiperLaunch.launch_description &&
              (kuiperLaunch.launch_description
                .toLowerCase()
                .includes("scrub") ||
                kuiperLaunch.launch_description
                  .toLowerCase()
                  .includes("was set")) &&
              kuiperLaunch.result !== -1
            ) {
              console.log(
                `Detected scrub in description for ${kuiperLaunch.name}, manually setting result to -1`,
              );
              kuiperLaunch.result = -1;
            }
          }

          // Store the current launch data as previous
          if (launchData) {
            setPreviousLaunchData(launchData);
          }

          // Store all launches for display
          setAllLaunches(data);
          // Set the first launch as the primary one
          setLaunchData(data[0]);
          // Check if launch is imminent
          setIsLaunchImminent(checkLaunchImminent(data[0]));

          // Special scrub handling: If the launch has been scrubbed (result === -1),
          // make sure to show the scrub status immediately
          if (data[0] && data[0].result === -1) {
            console.log(`Launch ${data[0].name} is SCRUBBED (result = -1)`);
            // Set scrub message and status
            setLaunchStatusMessage(
              `The ${data[0].name} launch has been scrubbed. Check RocketLaunch.live for updates.`,
            );
            setStatusChange("scrub");
          }

          // Detect changes in launch status
          if (
            previousLaunchData &&
            data[0] &&
            previousLaunchData.id === data[0].id
          ) {
            detectLaunchStatusChanges(previousLaunchData, data[0]);
          }
        } else {
          console.log("No upcoming Florida rocket launches found");
          setAllLaunches([]);
          setLaunchData(null);
          setIsLaunchImminent(false);
        }
      } catch (err) {
        console.error("Error fetching rocket launch data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setAllLaunches([]);
        setLaunchData(null);
        setIsLaunchImminent(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLaunchData();

    // Helper function to determine server fetch frequency
    const getServerFetchFrequency = () => {
      if (!launchData) return 60 * 60 * 1000; // Default: hourly

      try {
        const launchTimeStr = launchData.pad_time || launchData.window_start;
        if (!launchTimeStr) return 60 * 60 * 1000; // Default: hourly

        const launchTime = new Date(launchTimeStr).getTime();
        const currentTime = new Date().getTime();
        const diffMs = Math.abs(launchTime - currentTime);

        // Within 1 hour of launch (before or after): refresh every 1 minute
        if (diffMs < 60 * 60 * 1000) return 60 * 1000;

        // Within 6 hours: refresh every 5 minutes
        if (diffMs < 6 * 60 * 60 * 1000) return 5 * 60 * 1000;

        // Otherwise refresh hourly
        return 60 * 60 * 1000;
      } catch (e) {
        return 60 * 60 * 1000; // Default: hourly if there's an error
      }
    };

    // Initial fetch frequency
    let fetchFrequency = getServerFetchFrequency();
    let intervalId = setInterval(() => {
      fetchLaunchData();

      // Dynamically adjust fetch frequency based on proximity to launch
      const newFrequency = getServerFetchFrequency();
      if (newFrequency !== fetchFrequency) {
        console.log(
          `Adjusting API fetch frequency to ${newFrequency / 1000} seconds`,
        );
        clearInterval(intervalId);
        fetchFrequency = newFrequency;
        intervalId = setInterval(fetchLaunchData, fetchFrequency);
      }
    }, fetchFrequency);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  // Format date and time from ISO string
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "date to be announced";

    const date = new Date(dateStr);
    // Check if the date is valid before formatting
    if (isNaN(date.getTime())) {
      return "date to be announced";
    }

    return date.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  };

  // Format date and time for cleaner display
  const getFormattedTimeForDisplay = (dateStr: string | null) => {
    if (!dateStr) return "To Be Announced";

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return "To Be Announced";
    }

    // Format as: "12:00 PM EDT (4:00 PM UTC)"
    const localTime = date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    });

    const utcTime = date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });

    return `${localTime.replace("UTC", "EDT")} (${utcTime})`;
  };

  // Format estimated date object
  const getFormattedDate = (estDate: any) => {
    if (!estDate || !estDate.year) return "date to be announced";

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthName = monthNames[estDate.month - 1];
    return `${monthName} ${estDate.day}, ${estDate.year}`;
  };

  // Get abbreviated month name
  const getMonthAbbreviation = (monthNum: number) => {
    const monthAbbr = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    return monthAbbr[monthNum - 1] || "";
  };

  // Helper function to extract launch URL from quicktext or use the Florida filtered URL as fallback
  const getLaunchUrl = (launch: RocketLaunchData | null): string => {
    // If launch data is null, return the Florida filtered URL
    if (!launch) {
      return "https://www.rocketlaunch.live/?filter=florida";
    }
    
    // If quicktext is available and contains a URL to rocketlaunch.live
    if (launch.quicktext) {
      // Try to extract the URL from the quicktext field which has a format like:
      // "Atlas V - Project Kuiper 1 - Apr 09 (estimated) - https://rocketlaunch.live/launch/project-kuiper-1 for info/stream"
      const urlMatch = launch.quicktext.match(
        /(https:\/\/rocketlaunch\.live\/launch\/[a-z0-9-]+)/i,
      );
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }
    }

    // Fallback to the Florida filtered URL
    return "https://www.rocketlaunch.live/?filter=florida";
  };

  // Don't render anything if there's no upcoming Florida launch
  // Always show the rocket icon regardless of launch data availability
  // This ensures the icon is visible in production even if the API doesn't return data

  // Render the custom rocket icon if available, otherwise use default
  // Always use the Asset1.svg as the rocket icon
  const renderRocketIcon = () => {
    console.log("Using filesystem rocket icon");
    
    // Use only local files, no Object Storage
    const rocketIconUrl = "/icons/Asset1.svg";
    
    // Fallback URLs in case the primary one fails
    const fallbackUrls = [
      "/uploads/icons/Asset1.svg",
      "/icons/rocket-icon.svg", 
      "/uploads/icons/rocket-icon.svg"
    ];
    
    return (
      <img
        src={rocketIconUrl}
        alt="Rocket launch"
        className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 object-contain"
        style={{ transform: "translateX(0.05px)" }}
        onError={(e) => {
          // Enhanced error handler with filesystem fallbacks
          const img = e.target as HTMLImageElement;
          console.log(`Rocket icon failed to load from ${img.src}, trying fallbacks`);
          
          // Find the current fallback index
          const currentIndex = fallbackUrls.findIndex(url => url === img.src);
          
          if (currentIndex < fallbackUrls.length - 1) {
            // Try the next fallback
            const nextUrl = fallbackUrls[currentIndex + 1];
            console.log(`Trying next fallback: ${nextUrl}`);
            img.src = nextUrl;
          } else {
            // We've exhausted all options
            console.error("All rocket icon URLs failed to load");
            // Create a transparent 1x1 pixel SVG as absolute last resort
            img.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg==";
          }
        }}
      />
    );
  };

  // If user doesn't have permission to see the rocket icon, return null
  if (!canSeeWeatherRocketIcons) {
    return null;
  }

  return (
    <>
      {isLoading ? (
        <div className="animate-pulse mr-2">
          <img
            src="/icons/Asset1.svg"
            alt="Loading..."
            className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 opacity-50"
            onError={(e) => {
              // Use same fallback chain approach
              const img = e.target as HTMLImageElement;
              console.log(`Loading rocket icon failed to load, trying fallback`);
              
              const fallbackUrls = [
                "/uploads/icons/Asset1.svg",
                "/icons/rocket-icon.svg", 
                "/uploads/icons/rocket-icon.svg"
              ];
              
              // Try first fallback
              img.src = fallbackUrls[0];
              
              // Setup cascading fallbacks
              let fallbackIndex = 0;
              img.onerror = () => {
                fallbackIndex++;
                if (fallbackIndex < fallbackUrls.length) {
                  img.src = fallbackUrls[fallbackIndex];
                } else {
                  // Last resort - transparent 1px SVG
                  img.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg==";
                }
              };
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center ml-2 md:ml-4 text-coral hover:text-orange-600 transition-colors relative group z-[40]"
          aria-label="View upcoming rocket launch details"
          style={{ position: "relative", isolation: "isolate" }}
        >
          {/* Rocket with enhanced flame animation */}
          <div className="rocket-container animate-float relative z-[40]">
            {/* Add blinking red indicator when launch is imminent or amber for scrubbed (only 1 hour after announcement) */}
            {isLaunchImminent && (
              <div
                className={`imminent-launch-indicator ${launchData?.result === -1 ? "bg-amber-500" : ""}`}
                title={
                  launchData?.result === -1
                    ? "Launch scrubbed (announced within last hour)"
                    : "Launch approaching (within 1 hour)"
                }
              />
            )}

            {renderRocketIcon()}
            {/* Flame animation with improved effects */}
            <div className="flame-container" aria-hidden="true">
              <div className="flame-base"></div>
              <div className="flame-middle"></div>
              <div className="flame-tip"></div>
              <div className="spark spark1"></div>
              <div className="spark spark2"></div>
              <div className="spark spark3"></div>
              <div className="smoke smoke1"></div>
              <div className="smoke smoke2"></div>
            </div>

            {/* Hover tooltip with scrub status */}
            <div
              className="absolute top-10 -right-28 whitespace-nowrap 
                        bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-lg 
                        text-xs border border-coral/20 z-[40]
                        transition-opacity duration-300 pointer-events-none opacity-0 group-hover:opacity-100"
            >
              <span className="font-semibold text-coral">
                {launchData ? "Florida Launch:" : "No upcoming launches"}
              </span>
              <div className="mt-1 text-gray-700">
                {launchData ? (
                  <div>{launchData.name}</div>
                ) : (
                  <div>Check back soon for upcoming launches</div>
                )}

                {launchData && launchData.result === -1 ? (
                  <div className="flex items-center">
                    <span className="line-through text-gray-500 mr-2">
                      {launchData.pad_time
                        ? new Date(launchData.pad_time).toLocaleString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            },
                          )
                        : launchData.window_start
                          ? new Date(launchData.window_start).toLocaleString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )
                          : "Launch date TBD"}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] bg-amber-500 text-white rounded-full uppercase font-bold">
                      Scrubbed
                    </span>
                  </div>
                ) : launchData ? (
                  <div>
                    {launchData.pad_time
                      ? new Date(launchData.pad_time).toLocaleString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            timeZoneName: "short",
                          },
                        )
                      : launchData.window_start
                        ? new Date(launchData.window_start).toLocaleString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZoneName: "short",
                            },
                          )
                        : "Launch date TBD"}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </button>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rocket-launch-dialog">
          <DialogHeader>
            <DialogTitle className="dialog-title text-navy break-words hyphens-auto">
              {launchData ? "Upcoming Rocket Launches" : "Florida Rocket Launches"}
                {/* Either show launch status or imminent status */}
                {statusChange ? (
                  <span
                    className={`ml-2 px-2 py-1 text-sm rounded-full animate-pulse ${
                      statusChange === "delay" || statusChange === "scrub"
                        ? "bg-amber-500"
                        : statusChange === "failure"
                          ? "bg-red-600"
                          : statusChange === "success"
                            ? "bg-green-600"
                            : "bg-red-600"
                    } text-white`}
                  >
                    {statusChange === "delay" && "Launch Delayed!"}
                    {statusChange === "scrub" && "Launch Scrubbed!"}
                    {statusChange === "failure" && "Launch Failed!"}
                    {statusChange === "success" && "Launch Successful!"}
                  </span>
                ) : (
                  isLaunchImminent &&
                  launchData && (
                    <span className="ml-2 px-2 py-1 text-sm bg-red-600 text-white rounded-full animate-pulse">
                      {(() => {
                        // Prioritize pad_time over window_start
                        const launchTimeStr =
                          launchData.pad_time || launchData.window_start;
                        if (!launchTimeStr) return "Launch Approaching!";

                        const launchTime = new Date(launchTimeStr).getTime();
                        const currentTime = new Date().getTime();

                        if (launchTime > currentTime) {
                          // More than 10 minutes away
                          if (launchTime - currentTime > 10 * 60 * 1000) {
                            return "Launch Approaching!";
                          } else {
                            // Less than 10 minutes away
                            return "Launch Imminent!";
                          }
                        } else {
                          // Launch has already started
                          return "Launch In Progress!";
                        }
                      })()}
                    </span>
                  )
                )}
              </DialogTitle>
              <DialogDescription>
                Visible from Barefoot Bay, Florida
                {launchStatusMessage && (
                  <span className="block mt-2 text-sm font-medium">
                    {statusChange === "delay" && (
                      <span className="text-amber-500">
                        ⚠️ {launchStatusMessage}
                      </span>
                    )}
                    {statusChange === "scrub" && (
                      <span className="text-amber-500">
                        🚫 {launchStatusMessage}
                      </span>
                    )}
                    {statusChange === "failure" && (
                      <span className="text-red-500">
                        ❌ {launchStatusMessage}
                      </span>
                    )}
                    {statusChange === "success" && (
                      <span className="text-green-500">
                        ✅ {launchStatusMessage}
                      </span>
                    )}
                    {!statusChange && (
                      <span className="text-blue-500">
                        ℹ️ {launchStatusMessage}
                      </span>
                    )}
                  </span>
                )}
              </DialogDescription>
              {isLaunchImminent && launchData && launchData.result !== -1 && (
                <div className="mt-2">
                  <LiveCountdown launch={launchData} />
                </div>
              )}
            </DialogHeader>

            {/* Launch Status Banner - Show more prominently if scrubbed */}
            {launchData && launchData.result === -1 && (
              <div className="my-4 p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-800">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-amber-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <h3 className="font-bold text-amber-800">Launch Scrubbed</h3>
                </div>
                <p className="text-sm">
                  The {launchData.name} launch has been scrubbed
                  {launchData.modified
                    ? ` (as of ${new Date(launchData.modified).toLocaleString()})`
                    : ""}
                  .
                </p>
                <p className="text-sm mt-2">
                  Check{" "}
                  <a
                    href={getLaunchUrl(launchData)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    RocketLaunch.live
                  </a>{" "}
                  for updated information or potential new launch dates.
                </p>
              </div>
            )}

            <div className="space-y-6 my-4">
              {allLaunches.map((launch, index) => (
                <div
                  key={launch.id}
                  className={
                    index > 0 ? "pt-6 border-t border-gray-200 mt-6" : ""
                  }
                >
                  <h3 className="font-bold text-xl text-coral mb-4">
                    🚀 {launch.name}
                    {index > 0 ? ` (Florida Launch)` : ""}
                  </h3>

                  <div className="space-y-2 text-gray-700">
                    <p>
                      📅 <span className="font-medium">Launch Date:</span>{" "}
                      {launch.window_start
                        ? new Date(launch.window_start).toLocaleDateString(
                            "en-US",
                            {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        : launch.est_date
                          ? launch.launch_description
                              ?.toLowerCase()
                              .includes("target")
                            ? `Targeting ${getFormattedDate(launch.est_date)}`
                            : getFormattedDate(launch.est_date)
                          : "To Be Determined"}
                    </p>

                    <p>
                      🕓 <span className="font-medium">Launch Time:</span>{" "}
                      {launch.result === -1 ? (
                        <>
                          <span className="line-through text-gray-500">
                            {launch.pad_time
                              ? getFormattedTimeForDisplay(launch.pad_time)
                              : getFormattedTimeForDisplay(launch.window_start)}
                          </span>
                          <span className="ml-2 px-2 py-0.5 text-xs bg-amber-500 text-white rounded-full animate-pulse">
                            SCRUBBED
                          </span>
                          {launch.modified && (
                            <span className="block text-xs text-gray-500 mt-1">
                              Scrubbed at{" "}
                              {new Date(launch.modified).toLocaleString()}
                            </span>
                          )}
                        </>
                      ) : launch.pad_time ? (
                        <>
                          {getFormattedTimeForDisplay(launch.pad_time)}
                          <span className="ml-1 text-xs text-green-600">
                            (Official T-0)
                          </span>
                        </>
                      ) : launch.window_start ? (
                        getFormattedTimeForDisplay(launch.window_start)
                      ) : (
                        "To Be Announced"
                      )}
                    </p>

                    <p>
                      📍 <span className="font-medium">Location:</span>{" "}
                      {launch.pad.name && launch.pad.location.name
                        ? `${launch.pad.name}, ${launch.pad.location.name}`
                        : launch.pad.location.name}
                    </p>

                    <p>
                      🛰️ <span className="font-medium">Rocket:</span>{" "}
                      {launch.vehicle.name}
                    </p>

                    <p>
                      🏢 <span className="font-medium">Provider:</span>{" "}
                      {launch.provider.name}
                    </p>

                    {launch.missions && launch.missions.length > 0 && (
                      <p>
                        📡 <span className="font-medium">Mission:</span>{" "}
                        {launch.missions[0].description ||
                          launch.missions[0].name ||
                          "No mission details available"}
                      </p>
                    )}

                    <p>
                      🔗{" "}
                      <span className="font-medium">More Info & Stream:</span>{" "}
                      <a
                        href="https://www.rocketlaunch.live/?filter=florida"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View on RocketLaunch.live
                      </a>
                    </p>
                  </div>

                  {/* Optional weather info if available */}
                  {launch.weather_condition && (
                    <p className="mt-2 text-sm">
                      🌤️ <span className="font-medium">Weather:</span>{" "}
                      {launch.weather_condition}
                      {launch.weather_temp ? ` (${launch.weather_temp}°F)` : ""}
                    </p>
                  )}
                </div>
              ))}

              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="font-bold text-lg text-coral mb-2">
                  👁️ Viewing Tips for Barefoot Bay Residents
                </h3>
                <ul className="space-y-2 list-none">
                  <li>🧭 Face northeast (toward Cape Canaveral)</li>
                  <li>
                    ⏰ Arrive 10–15 minutes early for the best viewing
                    experience
                  </li>
                  <li>
                    🌟 Best visibility if skies are clear; check local weather
                  </li>
                  <li>
                    📱 Check{" "}
                    <a
                      href="https://www.rocketlaunch.live/?filter=florida"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      RocketLaunch.live
                    </a>{" "}
                    for last-minute changes or scrubs
                  </li>
                  {launchData && launchData.weather_concerns && (
                    <li className="text-amber-600">
                      ⚠️ Weather concerns: {launchData.weather_concerns}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => setIsDialogOpen(false)}
                className="bg-coral hover:bg-coral/80 text-white"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );
}
