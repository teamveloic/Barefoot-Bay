import { useState, useEffect, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, X, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getMediaUrl, handleImageError } from "@/lib/media-helper";

interface EventMediaGalleryProps {
  mediaUrls: string[];
}

export function EventMediaGallery({ mediaUrls }: EventMediaGalleryProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Return null if there are no media files
  if (!mediaUrls?.length) {
    return null;
  }

  // Set up embla carousel listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    const onSelect = () => {
      const index = emblaApi.selectedScrollSnap();
      setCurrentSlide(index);
    };
    
    emblaApi.on('select', onSelect);
    
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = () => {
    if (emblaApi) emblaApi.scrollPrev();
  };

  const scrollNext = () => {
    if (emblaApi) emblaApi.scrollNext();
  };

  const isVideo = (url: string) => {
    // Check common video file extensions
    return url.match(/\.(mp4|webm|ogg|mov|quicktime|avi|wmv|flv|mkv)$/i) !== null;
  };

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-lg" ref={emblaRef}>
        <div className="flex">
          {mediaUrls.map((url, index) => {
            const isVideoFile = isVideo(url);
            
            return (
              <div 
                key={index} 
                className="relative flex-[0_0_100%] min-w-0 cursor-pointer"
                onClick={() => setSelectedImage(url)}
              >
                {isVideoFile ? (
                  <div className="aspect-video bg-gray-800">
                    <video 
                      className="w-full h-full object-contain"
                      controls
                      playsInline
                      preload="metadata"
                      src={getMediaUrl(url, 'event')}
                      onError={(e) => {
                        console.error(`Video failed to load: ${url}`);
                        
                        // Try to extract just the filename and use the media service
                        if (url.includes('/')) {
                          const filename = url.split('/').pop();
                          if (filename) {
                            console.log(`Video load error recovery - trying media redirect service for: ${filename}`);
                            (e.target as HTMLVideoElement).src = `/media/${filename}`;
                            
                            // Add a second error handler that displays a message if media service fails
                            (e.target as HTMLVideoElement).onerror = () => {
                              console.error(`Media service failed for video ${filename}`);
                              
                              // Replace the video with an error message
                              const videoContainer = (e.target as HTMLVideoElement).parentElement;
                              if (videoContainer) {
                                videoContainer.innerHTML = `
                                  <div class="flex flex-col items-center justify-center h-full p-2 bg-black/80 text-white rounded-lg text-xs">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <circle cx="12" cy="12" r="10"></circle>
                                      <line x1="12" y1="8" x2="12" y2="12"></line>
                                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                    <p class="text-center text-gray-200 text-xs">Video unavailable</p>
                                  </div>
                                `;
                              }
                            };
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-100">
                    <img
                      src={getMediaUrl(url, 'event')}
                      alt={`Event media ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error(`Image failed to load: ${url}`);
                        
                        // First attempt - Try alternative path with /calendar/ folder
                        if (url.includes('/uploads/media-') && !url.includes('/calendar/')) {
                          console.log(`Retrying with calendar path: ${url}`);
                          (e.target as HTMLImageElement).src = url.replace('/uploads/media-', '/uploads/calendar/media-');
                          
                          // Set up cascade of fallbacks
                          (e.target as HTMLImageElement).onerror = () => {
                            console.log(`Calendar path failed, trying media service: ${url}`);
                            const filename = url.split('/').pop();
                            if (filename) {
                              (e.target as HTMLImageElement).src = `/media/${filename}`;
                              
                              // Try the default SVG fallback if media service fails
                              (e.target as HTMLImageElement).onerror = () => {
                                console.log(`Media service failed, using default fallback`);
                                (e.target as HTMLImageElement).src = 'https://object-storage.replit.app/CALENDAR/events/default-event-image.svg';
                                
                                // Final inline fallback that cannot fail
                                (e.target as HTMLImageElement).onerror = () => {
                                  console.error(`All fallbacks failed, using inline SVG`);
                                  const container = (e.target as HTMLImageElement).parentElement;
                                  if (container) {
                                    container.innerHTML = `
                                      <div class="flex flex-col items-center justify-center h-full w-full bg-gray-100 text-gray-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                                          stroke="currentColor" stroke-width="2" class="h-12 w-12 mb-2 opacity-70">
                                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                          <polyline points="21 15 16 10 5 21"></polyline>
                                        </svg>
                                        <span class="text-sm">Image unavailable</span>
                                      </div>
                                    `;
                                  }
                                };
                              };
                            }
                          };
                        }
                        // Try alternative path without /calendar/ folder
                        else if (url.includes('/uploads/calendar/media-')) {
                          console.log(`Retrying without calendar path: ${url}`);
                          (e.target as HTMLImageElement).src = url.replace('/uploads/calendar/', '/uploads/');
                          
                          // Set fallback chain
                          (e.target as HTMLImageElement).onerror = () => {
                            console.log(`Direct path failed, using default fallback`);
                            (e.target as HTMLImageElement).src = 'https://object-storage.replit.app/CALENDAR/events/default-event-image.svg';
                            
                            // Final inline fallback
                            (e.target as HTMLImageElement).onerror = () => {
                              const container = (e.target as HTMLImageElement).parentElement;
                              if (container) {
                                container.innerHTML = `
                                  <div class="flex flex-col items-center justify-center h-full w-full bg-gray-100 text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                                      stroke="currentColor" stroke-width="2" class="h-12 w-12 mb-2 opacity-70">
                                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                      <polyline points="21 15 16 10 5 21"></polyline>
                                    </svg>
                                    <span class="text-sm">Image unavailable</span>
                                  </div>
                                `;
                              }
                            };
                          };
                        }
                        // For any other URL pattern, go directly to fallbacks
                        else {
                          (e.target as HTMLImageElement).src = 'https://object-storage.replit.app/CALENDAR/events/default-event-image.svg';
                          
                          // Set final inline fallback
                          (e.target as HTMLImageElement).onerror = () => {
                            const container = (e.target as HTMLImageElement).parentElement;
                            if (container) {
                              container.innerHTML = `
                                <div class="flex flex-col items-center justify-center h-full w-full bg-gray-100 text-gray-500">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                                    stroke="currentColor" stroke-width="2" class="h-12 w-12 mb-2 opacity-70">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                  </svg>
                                  <span class="text-sm">Image unavailable</span>
                                </div>
                              `;
                            }
                          };
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {mediaUrls.length > 1 && (
        <>
          <Button
            variant="outline"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white"
            onClick={scrollPrev}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white"
            onClick={scrollNext}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
          
          {/* Pagination indicators */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {mediaUrls.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  currentSlide === index ? "bg-white" : "bg-white/50 hover:bg-white/80"
                }`}
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => emblaApi?.scrollTo(index)}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-screen-xl max-h-screen p-0 overflow-hidden flex items-center justify-center bg-black/95">
          <DialogTitle className="sr-only">
            Event Media Viewer
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-50 bg-black/50 hover:bg-black/70 text-white"
            onClick={() => setSelectedImage(null)}
            aria-label="Close media viewer"
          >
            <X className="h-6 w-6" />
          </Button>
          
          {selectedImage && !isVideo(selectedImage) && (
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={selectedImage ? getMediaUrl(selectedImage, 'event') : ''}
                alt="Full size image"
                className="max-w-full max-h-[90vh] w-auto h-auto object-contain"
                onError={(e) => {
                  console.error(`Fullscreen image failed to load: ${selectedImage}`);
                  
                  // Try alternative path with /calendar/ folder
                  if (selectedImage.includes('/uploads/media-') && !selectedImage.includes('/calendar/')) {
                    (e.target as HTMLImageElement).src = selectedImage.replace('/uploads/media-', '/uploads/calendar/media-');
                    
                    // Set up cascade of fallbacks
                    (e.target as HTMLImageElement).onerror = () => {
                      console.log(`Calendar path failed, trying media service: ${selectedImage}`);
                      const filename = selectedImage.split('/').pop();
                      if (filename) {
                        (e.target as HTMLImageElement).src = `/media/${filename}`;
                        
                        // Try the default SVG fallback if media service fails
                        (e.target as HTMLImageElement).onerror = () => {
                          console.log(`Media service failed, using default fallback`);
                          (e.target as HTMLImageElement).src = 'https://object-storage.replit.app/CALENDAR/events/default-event-image.svg';
                          
                          // Final inline fallback that cannot fail
                          (e.target as HTMLImageElement).onerror = () => {
                            console.error(`All fallbacks failed, using inline SVG`);
                            const container = (e.target as HTMLImageElement).parentElement;
                            if (container) {
                              container.innerHTML = `
                                <div class="flex flex-col items-center justify-center h-full w-full bg-gray-100 text-gray-500 p-8 rounded-lg">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                                    stroke="currentColor" stroke-width="2" class="h-24 w-24 mb-4 opacity-70">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                  </svg>
                                  <h3 class="text-xl font-medium mb-2">Image Unavailable</h3>
                                  <p class="text-center text-gray-400 max-w-md">The requested image could not be loaded.</p>
                                </div>
                              `;
                            }
                          };
                        };
                      }
                    };
                  }
                  // Try alternative path without /calendar/ folder
                  else if (selectedImage.includes('/uploads/calendar/media-')) {
                    (e.target as HTMLImageElement).src = selectedImage.replace('/uploads/calendar/', '/uploads/');
                    
                    // Set fallback chain
                    (e.target as HTMLImageElement).onerror = () => {
                      (e.target as HTMLImageElement).src = 'https://object-storage.replit.app/CALENDAR/events/default-event-image.svg';
                      
                      // Final inline fallback
                      (e.target as HTMLImageElement).onerror = () => {
                        const container = (e.target as HTMLImageElement).parentElement;
                        if (container) {
                          container.innerHTML = `
                            <div class="flex flex-col items-center justify-center h-full w-full bg-gray-100 text-gray-500 p-8 rounded-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                                stroke="currentColor" stroke-width="2" class="h-24 w-24 mb-4 opacity-70">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                              </svg>
                              <h3 class="text-xl font-medium mb-2">Image Unavailable</h3>
                              <p class="text-center text-gray-400 max-w-md">The requested image could not be loaded.</p>
                            </div>
                          `;
                        }
                      };
                    };
                  }
                  // For any other case, try direct fallback
                  else {
                    (e.target as HTMLImageElement).src = 'https://object-storage.replit.app/CALENDAR/events/default-event-image.svg';
                    
                    // Final inline fallback
                    (e.target as HTMLImageElement).onerror = () => {
                      const container = (e.target as HTMLImageElement).parentElement;
                      if (container) {
                        container.innerHTML = `
                          <div class="flex flex-col items-center justify-center h-full w-full bg-gray-100 text-gray-500 p-8 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                              stroke="currentColor" stroke-width="2" class="h-24 w-24 mb-4 opacity-70">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                              <circle cx="8.5" cy="8.5" r="1.5"></circle>
                              <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                            <h3 class="text-xl font-medium mb-2">Image Unavailable</h3>
                            <p class="text-center text-gray-400 max-w-md">The requested image could not be loaded.</p>
                          </div>
                        `;
                      }
                    };
                  }
                }}
              />
            </div>
          )}
          
          {selectedImage && isVideo(selectedImage) && (
            <div className="relative bg-black/90 p-4 rounded-lg w-full max-w-4xl mx-auto">
              <video
                src={selectedImage ? getMediaUrl(selectedImage, 'event') : ''}
                className="max-w-full max-h-[80vh] w-full h-auto"
                controls
                autoPlay
                playsInline
                onError={(e) => {
                  console.error(`Fullscreen video failed to load: ${selectedImage}`);
                  
                  // Try to extract just the filename and use the media service
                  if (selectedImage.includes('/')) {
                    const filename = selectedImage.split('/').pop();
                    if (filename) {
                      console.log(`Video load error recovery - trying media redirect service for: ${filename}`);
                      (e.target as HTMLVideoElement).src = `/media/${filename}`;
                      
                      // Add a second error handler that displays a message if media service fails
                      (e.target as HTMLVideoElement).onerror = () => {
                        console.error(`Media service failed for video ${filename}`);
                        
                        // Replace the video with an error message
                        const videoContainer = (e.target as HTMLVideoElement).parentElement;
                        if (videoContainer) {
                          videoContainer.innerHTML = `
                            <div class="flex flex-col items-center justify-center h-full p-8 bg-black/80 text-white rounded-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-red-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                              </svg>
                              <h3 class="text-xl font-bold mb-2">Video Unavailable</h3>
                              <p class="text-center text-gray-200">Sorry, this video could not be loaded. It may have been moved or deleted.</p>
                            </div>
                          `;
                        }
                      };
                    }
                  }
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}