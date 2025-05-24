import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { normalizeMediaUrl } from '@/lib/media-cache';

export interface MediaGalleryItem {
  url: string;
  altText?: string;
  mediaType: 'image' | 'video';
}

interface MediaGalleryProps {
  items: MediaGalleryItem[];
  className?: string; 
  style?: React.CSSProperties;
}

export function MediaGallery({ items, className = '', style = {} }: MediaGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentItem = items[currentIndex];
  
  // Reset index when items change
  useEffect(() => {
    setCurrentIndex(0);
  }, [items]);
  
  // If there are no items, don't render anything
  if (!items.length) return null;
  
  // If there's only one item, just render it without navigation
  if (items.length === 1) {
    return (
      <div className={`media-gallery ${className}`} style={style}>
        {renderMediaItem(items[0])}
      </div>
    );
  }
  
  function handlePrevious() {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }
  
  function handleNext() {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }
  
  function renderMediaItem(item: MediaGalleryItem) {
    const normalizedUrl = normalizeMediaUrl(item.url);
    
    // Add fallback placeholder image
    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
      console.log("Image failed to load:", normalizedUrl);
      e.currentTarget.src = '/public/placeholder-image.jpg';
      e.currentTarget.onerror = null; // Prevent infinite loops
    };
    
    return item.mediaType === 'video' ? (
      <video 
        src={normalizedUrl}
        controls
        className="max-w-full h-auto"
        alt={item.altText || 'Video'}
        onError={(e) => {
          console.error(`Failed to load video at ${normalizedUrl}`);
          // Add error handling UI for videos if needed
          const videoElement = e.target as HTMLVideoElement;
          videoElement.poster = '/public/media-placeholder/video-placeholder.png';
          
          // Create error message overlay
          const parent = videoElement.parentElement;
          if (parent) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'absolute inset-0 flex items-center justify-center bg-black/50 text-white p-4 text-center text-sm';
            errorDiv.textContent = 'Video could not be loaded';
            parent.appendChild(errorDiv);
          }
        }}
      />
    ) : (
      <img 
        src={normalizedUrl}
        alt={item.altText || 'Image'}
        className="max-w-full h-auto object-contain"
        onError={(e) => {
          console.error(`Failed to load image at ${normalizedUrl}`);
          
          // Extract just the filename for trying different path formats
          const fileName = normalizedUrl.split('/').pop();
          if (!fileName) {
            (e.target as HTMLImageElement).src = '/public/media-placeholder/default-image.svg';
            return;
          }
          
          // Track if this is already a fallback attempt to prevent loops
          const isRetry = (e.target as HTMLImageElement).getAttribute('data-retry') === 'true';
          if (isRetry) {
            // We've already tried falling back once, go to default image
            (e.target as HTMLImageElement).src = '/public/media-placeholder/default-image.svg';
            return;
          }
          
          // Try multiple path formats in sequence based on which format failed
          if (normalizedUrl.includes('/api/real-estate-media/')) {
            // API path failed, try uploads path
            const uploadsUrl = `/uploads/real-estate-media/${fileName}`;
            console.log(`Trying uploads path: ${uploadsUrl}`);
            (e.target as HTMLImageElement).setAttribute('data-retry', 'true');
            (e.target as HTMLImageElement).src = uploadsUrl;
          } 
          else if (normalizedUrl.includes('/uploads/real-estate-media/')) {
            // Uploads path failed, try object storage path
            const objectStorageUrl = `/api/storage-proxy/REAL_ESTATE/${fileName}`;
            console.log(`Trying object storage path: ${objectStorageUrl}`);
            (e.target as HTMLImageElement).setAttribute('data-retry', 'true');
            (e.target as HTMLImageElement).src = objectStorageUrl;
          }
          else if (normalizedUrl.includes('/api/storage-proxy/')) {
            // Object storage path failed, try direct-realestate path
            const directUrl = `/api/storage-proxy/direct-realestate/${fileName}`;
            console.log(`Trying direct real estate path: ${directUrl}`);
            (e.target as HTMLImageElement).setAttribute('data-retry', 'true');
            (e.target as HTMLImageElement).src = directUrl;
          }
          else {
            // None of our known paths or we've exhausted options, use default image
            (e.target as HTMLImageElement).src = '/public/media-placeholder/default-image.svg';
          }
        }}
      />
    );
  }
  
  return (
    <div className={`media-gallery relative ${className}`} style={style}>
      {/* Gallery counter */}
      <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm z-10">
        {currentIndex + 1} / {items.length}
      </div>
      
      {/* Navigation controls */}
      <div className="absolute top-1/2 left-0 right-0 flex justify-between items-center transform -translate-y-1/2 px-2">
        <Button 
          onClick={handlePrevious}
          size="icon"
          variant="secondary"
          className="rounded-full bg-black/30 hover:bg-black/50 text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <Button 
          onClick={handleNext}
          size="icon"
          variant="secondary"
          className="rounded-full bg-black/30 hover:bg-black/50 text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Current media item */}
      <div className="media-content flex justify-center items-center">
        {renderMediaItem(currentItem)}
      </div>
    </div>
  );
}