import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { RocketAnimation } from '@/components/launch/rocket-animation';
import { CountdownTimer } from '@/components/launch/countdown-timer';
import { Redirect } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Settings, Clock, Upload, Check } from 'lucide-react';

export default function LaunchPage() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const [settings, setSettings] = useState<{
    launchDate: string;
    rocketIcon: string;
    launchMessage: string;
    soundEnabled: boolean;
    isActive: boolean;
  }>({
    launchDate: new Date(Date.now() + 86400000).toISOString(), // Default to tomorrow
    rocketIcon: '',
    launchMessage: 'Get ready for takeoff!',
    soundEnabled: false,
    isActive: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [screenPullPosition, setScreenPullPosition] = useState(0);
  const [screenOpacity, setScreenOpacity] = useState(1);
  const [isLaunchComplete, setIsLaunchComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasFetchedRef = useRef(false);
  
  // Admin settings dialogs
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);
  const [isRocketDialogOpen, setIsRocketDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(settings.launchDate));
  const [selectedTime, setSelectedTime] = useState<string>(
    new Date(settings.launchDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [selectedRocketIcon, setSelectedRocketIcon] = useState<string>(settings.rocketIcon);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Calculate if the page should be shown based on:
  // 1. If the user is an admin (always show for admins)
  // 2. If the launch feature is active
  const shouldShowLaunchPage = isAdmin || settings.isActive;
  
  // Handle countdown completion
  const handleCountdownComplete = useCallback(() => {
    console.log("Countdown complete! Starting launch sequence...");
    
    // Preload homepage content in the background for a smoother transition later
    const preloadHomeFrame = document.createElement('iframe');
    preloadHomeFrame.style.position = 'absolute';
    preloadHomeFrame.style.width = '0';
    preloadHomeFrame.style.height = '0';
    preloadHomeFrame.style.opacity = '0';
    preloadHomeFrame.style.pointerEvents = 'none';
    preloadHomeFrame.src = '/';
    document.body.appendChild(preloadHomeFrame);
    
    // Start the launch animation
    setIsLaunching(true);
    
    // Play launch sound if enabled
    if (settings.soundEnabled && audioRef.current) {
      audioRef.current.play().catch(err => {
        console.error('Failed to play launch sound:', err);
      });
    }
  }, [settings]);

  // Handle launch completion
  const handleLaunchComplete = useCallback(() => {
    console.log("Launch complete! Redirecting to homepage...");
    setIsLaunchComplete(true);
    
    // Start the screen pull animation
    let frame = 0;
    const totalFrames = 120; // 2 seconds at 60fps
    const animationInterval = setInterval(() => {
      frame++;
      
      // Pull the screen up following the rocket
      if (frame > 30) { // Start after half a second
        const progress = Math.min(1, (frame - 30) / (totalFrames - 30));
        setScreenPullPosition(-progress * window.innerHeight * 1.5);
        
        // Fade out the screen as it gets pulled up
        if (frame > 60) { // Start fading half way through pull
          const opacityProgress = 1 - (frame - 60) / (totalFrames - 60);
          setScreenOpacity(Math.max(0, opacityProgress));
        }
      }
      
      // End animation
      if (frame >= totalFrames) {
        clearInterval(animationInterval);
      }
    }, 1000 / 60);
    
    // Longer delay to allow screen pull animation to complete
    setTimeout(() => {
      // Use window.location.replace for a cleaner transition without adding to history
      window.location.replace('/');
    }, 3500); // Extended delay to ensure the screen pull animation completes
    
    return () => {
      clearInterval(animationInterval);
    };
  }, []);

  // Function to handle updating the launch date/time
  const handleUpdateLaunchDate = useCallback(async () => {
    if (!selectedDate) return;
    
    try {
      // Parse the time string to get hours and minutes
      const [hours, minutes] = selectedTime.split(':').map(num => parseInt(num, 10));
      
      // Create a new date with the selected date and time
      const newLaunchDate = new Date(selectedDate);
      newLaunchDate.setHours(hours);
      newLaunchDate.setMinutes(minutes);
      
      // Update the API
      const response = await fetch('/api/launch/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          launchDate: newLaunchDate.toISOString()
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to update launch date');
      }
      
      // Update local state
      setSettings(prev => ({
        ...prev,
        launchDate: newLaunchDate.toISOString()
      }));
      
      // Close the dialog
      setIsDateDialogOpen(false);
      
    } catch (err) {
      console.error('Error updating launch date:', err);
      setError('Failed to update launch date. Please try again.');
    }
  }, [selectedDate, selectedTime]);
  
  // Function to handle updating the rocket icon
  const handleUpdateRocketIcon = useCallback(async () => {
    try {
      if (!fileInputRef.current?.files?.length) {
        throw new Error('No file selected');
      }
      
      const file = fileInputRef.current.files[0];
      const formData = new FormData();
      formData.append('rocketIcon', file);
      
      // Upload the image
      const response = await fetch('/api/launch/rocket-icon', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload rocket icon');
      }
      
      const data = await response.json();
      
      // Update local state
      setSettings(prev => ({
        ...prev,
        rocketIcon: data.iconUrl
      }));
      
      // Close the dialog
      setIsRocketDialogOpen(false);
      
    } catch (err) {
      console.error('Error updating rocket icon:', err);
      setError('Failed to update rocket icon. Please try again.');
    }
  }, []);
  
  // Admin trigger launch function
  const handleTriggerLaunch = useCallback(async () => {
    try {
      const response = await fetch('/api/launch/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to trigger launch');
      }
      
      const data = await response.json();
      if (data.success) {
        console.log("Manual launch triggered!");
        handleCountdownComplete();
      }
    } catch (err) {
      console.error('Error triggering launch:', err);
      setError('Failed to trigger launch. Please try again.');
    }
  }, [handleCountdownComplete]);

  // Fetch launch settings only once on initial load
  useEffect(() => {
    async function fetchSettings() {
      // Already fetched - don't do it again
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;
      
      try {
        // Create one-hour target date
        const oneHourFromNow = new Date();
        oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
        console.log("Using launch date:", oneHourFromNow.toISOString());
        
        // Fetch settings from API
        const response = await fetch('/api/launch/settings');
        if (!response.ok) throw new Error('Failed to fetch launch settings');
        
        const data = await response.json();
        if (data.success && data.settings) {
          // Override with our test settings
          const testSettings = {
            ...data.settings,
            launchDate: oneHourFromNow.toISOString(),
            launchMessage: '',
          };
          
          setSettings(testSettings);
          
          // Admin debug info
          console.log("User role:", user?.role);
          
          // Check if already past launch time
          const now = new Date();
          if (now >= oneHourFromNow) {
            if (user?.role !== 'admin') {
              console.log("Launch time passed - starting sequence for regular user");
              handleCountdownComplete();
            } else {
              console.log("Launch time passed - admin can use manual launch");
            }
          }
        }
      } catch (error) {
        console.error('Settings fetch error:', error);
        setError('Failed to load launch configuration');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchSettings();
  }, []);  // Empty dependency array = run once on mount
  
  // If the user shouldn't see this page and not an admin, redirect to homepage
  if (!shouldShowLaunchPage && !isLoading) {
    return <Redirect to="/" />;
  }
  
  // Render launch page
  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden">
      {/* Screen overlay that gets pulled away during launch */}
      {isLaunching && (
        <div 
          className="screen-pull-overlay" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%)',
            zIndex: 2000,
            transform: `translateY(${screenPullPosition}px)`,
            opacity: screenOpacity,
            transition: 'transform 0.1s linear, opacity 0.3s ease-out',
          }}
        />
      )}
      {/* Background - Starry sky */}
      <div 
        className="absolute inset-0 bg-black"
        style={{
          background: 'radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%)',
          zIndex: -2
        }}
      >
        {/* Stars */}
        <div className="stars-container">
          {Array.from({ length: 200 }).map((_, index) => (
            <div
              key={index}
              className="star"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                width: `${Math.random() * 3 + 1}px`,
                height: `${Math.random() * 3 + 1}px`,
                animationDelay: `${Math.random() * 10}s`,
                animationDuration: `${Math.random() * 3 + 2}s`
              }}
            />
          ))}
        </div>
      </div>
      
      {/* Launch pad base */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-800 to-transparent"
        style={{ zIndex: -1 }}
      />
      
      {/* Main content */}
      <div className="w-full h-full flex flex-col items-center justify-center">
        {isLoading ? (
          <div className="text-white text-center">
            <p className="text-xl">Loading launch configuration...</p>
          </div>
        ) : error ? (
          <div className="text-red-500 text-center">
            <p className="text-xl">{error}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => { 
                hasFetchedRef.current = false; 
                setIsLoading(true);
                setError(null);
                window.location.reload();
              }}
            >
              Try Again
            </Button>
          </div>
        ) : (
          <div className="text-center text-white relative z-10 transition-opacity duration-1000" style={{
            opacity: isLaunchComplete ? 0 : 1,
          }}>
            {/* Title and message */}
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              {settings.launchMessage}
            </h1>
            
            {/* Countdown timer */}
            {!isLaunching && (
              <div className="my-8 relative">
                {/* Setting icon for countdown timer (admin only) */}
                {user?.role === 'admin' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -top-6 right-0 text-green-500 hover:text-green-400 hover:bg-black/20"
                    onClick={() => setIsDateDialogOpen(true)}
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                )}
                
                <CountdownTimer 
                  targetDate={new Date(settings.launchDate)} 
                  onCountdownComplete={isAdmin ? () => {} : handleCountdownComplete}
                />
              </div>
            )}
            
            {/* Force display of admin launch button */}
            {user?.role === 'admin' && (
              <div className="mt-8">
                <div className="launch-button-container">
                  <Button
                    variant="default"
                    size="lg"
                    className="launch-button bg-red-500 hover:bg-red-600 text-white font-bold py-6 px-12 text-2xl rounded-md shadow-lg"
                    onClick={handleTriggerLaunch}
                    style={{ 
                      backgroundColor: '#FF6F61', /* This is coral color */
                      border: '3px solid white',
                      position: 'relative',
                      zIndex: 10,
                      fontSize: '28px',
                      letterSpacing: '2px',
                      fontWeight: 'bold',
                      textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                    }}
                  >
                    LAUNCH NOW
                  </Button>
                </div>
                <p className="text-sm mt-2 text-white">
                  Admin Override: Press to launch immediately
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Fixed rocket image */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`rocket-container ${isLaunching ? 'rocket-launching' : 'rocket-idle'}`}>
            <img 
              src="/images/barefoot-bay-rocket.png" 
              alt="Barefoot Bay Rocket"
              className="rocket-image"
              onLoad={() => console.log("Rocket image loaded successfully")}
              onError={(e) => console.error("Error loading rocket image:", e)}
            />
          </div>
        </div>
      </div>
      
      {/* Sound effects */}
      {settings.soundEnabled && (
        <audio 
          ref={audioRef}
          src="/sounds/rocket-launch.mp3" 
          preload="auto"
        />
      )}
      
      {/* CSS animations */}
      <style>{`
        .stars-container {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        
        .star {
          position: absolute;
          background-color: white;
          border-radius: 50%;
          opacity: 0.8;
          animation: twinkle infinite alternate;
        }
        
        @keyframes twinkle {
          0% {
            opacity: 0.2;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
        
        .launch-button-container {
          position: relative;
          display: inline-block;
        }
        
        .launch-button-container::before {
          content: '';
          position: absolute;
          inset: -4px;
          background: linear-gradient(45deg, #ff0000, #ff8800, #ffff00, #ff0000);
          border-radius: 8px;
          animation: glow 2s linear infinite;
          z-index: 0;
        }
        
        @keyframes glow {
          0% {
            filter: hue-rotate(0deg) blur(2px);
            box-shadow: 0 0 20px rgba(255, 111, 97, 0.8);
          }
          50% {
            filter: hue-rotate(60deg) blur(4px);
            box-shadow: 0 0 40px rgba(255, 111, 97, 0.8);
          }
          100% {
            filter: hue-rotate(0deg) blur(2px);
            box-shadow: 0 0 20px rgba(255, 111, 97, 0.8);
          }
        }
        
        /* Rocket styles */
        .rocket-container {
          position: fixed;
          left: 50%;
          bottom: -100px;
          transform: translateX(-50%);
          z-index: 1000;
          transition: transform 0.2s ease-in-out;
          pointer-events: none;
        }
        
        .rocket-image {
          height: 400px;
          width: auto;
          filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.5));
        }
        
        .rocket-idle {
          animation: rocketHover 3s ease-in-out infinite;
        }
        
        .rocket-launching {
          animation: rocketLaunch 3.5s forwards cubic-bezier(0.19, 1, 0.22, 1);
        }
        
        @keyframes rocketHover {
          0%, 100% {
            transform: translateY(0) translateX(-50%);
          }
          50% {
            transform: translateY(-15px) translateX(-50%);
          }
        }
        
        @keyframes rocketLaunch {
          0% {
            transform: translateY(0) translateX(-50%);
            opacity: 1;
          }
          20% {
            transform: translateY(-50px) translateX(-50%);
            opacity: 1;
          }
          100% {
            transform: translateY(-2000px) translateX(-50%);
            opacity: 0;
          }
        }
      `}</style>
      
      {/* Date setting dialog */}
      <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
        <DialogContent className="bg-[#1e293b] border-green-500 text-white">
          <DialogHeader>
            <DialogTitle className="text-green-500">Change Launch Date & Time</DialogTitle>
            <DialogDescription className="text-gray-300">
              Set when the countdown should reach zero.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="countdown-date" className="text-gray-300">Launch Date</Label>
              <div className="flex flex-col space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-black/40 text-gray-200 border-gray-700 hover:bg-black/60"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#1e293b] border-green-500">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      className="bg-[#1e293b] text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="countdown-time" className="text-gray-300">Launch Time</Label>
              <Input
                id="countdown-time"
                type="time" 
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="bg-black/40 text-gray-200 border-gray-700"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDateDialogOpen(false)}
              className="bg-transparent text-gray-300 border-gray-600 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateLaunchDate}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              Update Launch Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Rocket Icon setting dialog */}
      <Dialog open={isRocketDialogOpen} onOpenChange={setIsRocketDialogOpen}>
        <DialogContent className="bg-[#1e293b] border-green-500 text-white">
          <DialogHeader>
            <DialogTitle className="text-green-500">Change Rocket Image</DialogTitle>
            <DialogDescription className="text-gray-300">
              Upload a custom image for the rocket.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rocket-image" className="text-gray-300">Rocket Image</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="rocket-image"
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="bg-black/40 text-gray-200 border-gray-700"
                />
              </div>
              
              {settings.rocketIcon && (
                <div className="mt-4 flex flex-col items-center">
                  <p className="text-sm text-gray-400 mb-2">Current Rocket Image:</p>
                  <img
                    src={settings.rocketIcon}
                    alt="Current rocket"
                    className="max-h-32 object-contain border border-gray-700 rounded-md p-2"
                  />
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsRocketDialogOpen(false)}
              className="bg-transparent text-gray-300 border-gray-600 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateRocketIcon}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              Update Rocket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}