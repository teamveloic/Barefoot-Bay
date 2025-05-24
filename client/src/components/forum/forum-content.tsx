import React from 'react';
import parse, { HTMLReactParserOptions, domToReact, Element, attributesToProps } from 'html-react-parser';
import { SmartImage } from '../shared/smart-image';

/**
 * ForumContent component for rendering HTML content with smart image handling
 * 
 * This component parses HTML content (from TinyMCE or similar editors) and 
 * replaces standard <img> tags with our SmartImage component to handle 
 * multiple path formats and fallbacks in production.
 */
interface ForumContentProps {
  content: string;
  className?: string;
  allowCache?: boolean;
}

export const ForumContent: React.FC<ForumContentProps> = ({ 
  content, 
  className = 'prose max-w-none',
  allowCache = false,
}) => {
  // Skip processing if content is empty
  if (!content || content.trim() === '') {
    return null;
  }

  // Configure HTML parser options
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      // Only process Element nodes (not text nodes)
      if (domNode instanceof Element && domNode.name === 'img') {
        // Extract image attributes
        const props = attributesToProps(domNode.attribs);
        const src = props.src as string;
        const alt = props.alt as string || 'Forum image';
        
        // Custom class for forum content images
        const imgClass = `forum-content-image ${props.className || ''}`;

        // Return SmartImage component with production fallbacks
        return (
          <SmartImage
            src={src}
            alt={alt}
            className={imgClass}
            cacheBust={!allowCache}
            {...props}
          />
        );
      }

      // For embedded videos (iframes)
      if (domNode instanceof Element && domNode.name === 'iframe') {
        const props = attributesToProps(domNode.attribs);
        return (
          <div className="video-container relative w-full pb-[56.25%] h-0 my-4">
            <iframe
              {...props}
              className="absolute top-0 left-0 w-full h-full rounded"
              allowFullScreen
            />
          </div>
        );
      }

      // Process link elements to handle forum-media URLs
      if (domNode instanceof Element && domNode.name === 'a') {
        const props = attributesToProps(domNode.attribs);
        const href = props.href as string || '';
        
        // If link is to an image, wrap it with SmartImage
        if (href && 
            (href.includes('/forum-media/') || 
             href.includes('/uploads/forum-media/') ||
             href.endsWith('.jpg') || 
             href.endsWith('.jpeg') || 
             href.endsWith('.png') || 
             href.endsWith('.gif'))) {
          return (
            <a 
              {...props} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="block my-4"
            >
              <SmartImage
                src={href}
                alt="Forum attachment"
                className="max-w-full h-auto rounded-md"
                cacheBust={!allowCache}
              />
            </a>
          );
        }
      }

      return undefined;
    }
  };

  // Process the HTML content
  const processedContent = parse(content, options);

  return (
    <div className={className}>
      {processedContent}
    </div>
  );
};

export default ForumContent;