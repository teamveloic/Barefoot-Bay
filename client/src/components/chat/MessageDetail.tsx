import React, { useEffect, useState } from 'react';
import { Message } from '../../types/chat';
import AttachmentViewer from './AttachmentViewer';
import { getMediaUrl } from '../../lib/media-helper';

interface MessageDetailProps {
  message: Message;
  onDelete?: () => void;
  onBack?: () => void;
  onReply?: (message: Message) => void;
}

// Safe date formatting function using native JavaScript
const formatDateSafe = (dateString: string | Date | undefined) => {
  try {
    // Handle undefined case first
    if (!dateString) {
      return 'Unknown date';
    }
    
    // Handle both string and Date objects
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    
    // Check if date is valid before formatting
    if (isNaN(date.getTime())) {
      console.warn('Invalid date value:', dateString);
      return 'Unknown date';
    }
    
    // Use native JavaScript date formatting
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  } catch (error) {
    console.error('Date parsing error:', error);
    return 'Unknown date';
  }
};

// Component for displaying a single reply
const MessageReply: React.FC<{ 
  reply: any; 
  formatDate: (date: any) => string;
  onViewAttachment: (attachments: any[], initialIndex: number) => void;
}> = ({ reply, formatDate, onViewAttachment }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 my-3">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold">{reply.senderName}</div>
          <div className="text-xs text-gray-500">{formatDate(reply.timestamp || reply.createdAt)}</div>
        </div>
      </div>
      <div 
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: reply.content }}
      />
      
      {/* Display reply attachments if any */}
      {reply.attachments && reply.attachments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-sm font-medium mb-2">Attachments:</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reply.attachments.map((attachment, index) => {
              const isImage = attachment.filename.match(/\.(jpeg|jpg|gif|png)$/i);
              const isVideo = attachment.filename.match(/\.(mp4|mov|avi|wmv)$/i);
              
              return (
                <div
                  key={attachment.id}
                  onClick={() => onViewAttachment(reply.attachments, index)}
                  className="border rounded hover:bg-gray-100 cursor-pointer flex items-center p-2"
                >
                  {isImage ? (
                    <div className="w-10 h-10 mr-2 overflow-hidden flex-shrink-0">
                      <img 
                        src={getMediaUrl(attachment.url, 'attachment')} 
                        alt={attachment.filename}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error(`Failed to load attachment image: ${attachment.url}`);
                          console.error(`Transformed URL was: ${getMediaUrl(attachment.url, 'attachment')}`);
                          e.currentTarget.src = '/public/media-placeholder/image-placeholder.png';
                        }}
                      />
                    </div>
                  ) : isVideo ? (
                    <div className="w-10 h-10 mr-2 bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-10 h-10 mr-2 bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  )}
                  <span className="text-sm text-blue-600 truncate">{attachment.filename}</span>
                  {/* Add a debugging element to see the actual URL being used */}
                  {/* <div className="text-xs text-gray-400 truncate">{getMediaUrl(attachment.url, 'attachment')}</div> */}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const MessageDetail: React.FC<MessageDetailProps> = ({
  message,
  onDelete,
  onBack,
  onReply
}) => {
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState(0);
  const [currentAttachments, setCurrentAttachments] = useState<any[]>([]);
  
  // We'll use our formatDateSafe function instead (already defined above)
  // Keeping this here for backwards compatibility with any code that calls formatDate
  const formatDate = formatDateSafe;
  
  // Handler for opening the attachment viewer for main message
  const openAttachmentViewer = (index: number) => {
    console.log("Opening attachment viewer for index:", index);
    console.log("Attachments:", message.attachments);
    
    if (!message.attachments || message.attachments.length === 0) {
      console.error("No attachments available to display");
      return;
    }
    
    // Make sure we create a new array to trigger proper state updates
    const attachmentsToShow = [...message.attachments];
    console.log("Setting attachments for viewer:", attachmentsToShow);
    
    // Set state in sequence to ensure proper rendering
    setSelectedAttachmentIndex(index);
    setCurrentAttachments(attachmentsToShow);
    
    // Add a small delay before opening the viewer to ensure state is updated
    setTimeout(() => {
      console.log("Opening viewer with state:", {
        attachments: attachmentsToShow,
        index,
        viewerOpen: true
      });
      setViewerOpen(true);
    }, 50);
  };
  
  // Handler for opening the attachment viewer for replies
  const openReplyAttachmentViewer = (attachments: any[], index: number) => {
    console.log("Opening reply attachment viewer for index:", index);
    console.log("Reply attachments:", attachments);
    
    if (!attachments || attachments.length === 0) {
      console.error("No reply attachments available to display");
      return;
    }
    
    // Make sure we create a new array to trigger proper state updates
    const attachmentsToShow = [...attachments];
    
    // Set state in sequence to ensure proper rendering
    setSelectedAttachmentIndex(index);
    setCurrentAttachments(attachmentsToShow);
    
    // Add a small delay before opening the viewer to ensure state is updated
    setTimeout(() => {
      setViewerOpen(true);
    }, 50);
  };

  // Fetch replies when the message changes
  useEffect(() => {
    const fetchReplies = async () => {
      if (!message || !message.id) return;
      
      setLoading(true);
      try {
        console.log(`Fetching replies for message ${message.id}`);
        const response = await fetch(`/api/messages/${message.id}/replies`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`Received ${data.length} replies:`, data);
          setReplies(data);
        } else {
          console.error(`Error fetching replies: ${response.status}`);
        }
      } catch (error) {
        console.error("Failed to fetch replies:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchReplies();
  }, [message]);

  // Debug output with extra attachment information
  console.log('MessageDetail - Full message data:', message);
  console.log('MessageDetail - Message attachments:', message.attachments);
  console.log('MessageDetail - Attachment type:', message.attachments ? typeof message.attachments : 'undefined');
  console.log('MessageDetail - Attachments array?', message.attachments ? Array.isArray(message.attachments) : 'undefined');
  console.log('MessageDetail - Fetched replies:', replies);

  // Add debug for attachments
  useEffect(() => {
    if (viewerOpen) {
      console.log("Attachment viewer should be opening: viewerOpen =", viewerOpen);
      console.log("Current attachments:", currentAttachments);
      console.log("Selected index:", selectedAttachmentIndex);
    }
  }, [viewerOpen, currentAttachments, selectedAttachmentIndex]);

  // Debug log for attachment viewer state
  useEffect(() => {
    if (viewerOpen) {
      console.log('AttachmentViewer should be visible with:', {
        attachmentsCount: currentAttachments.length,
        initialIndex: selectedAttachmentIndex,
        viewerOpen
      });
    }
  }, [viewerOpen, currentAttachments, selectedAttachmentIndex]);

  return (
    <div className="p-6 relative">
      {/* Attachment Viewer - Rendered unconditionally to avoid mounting issues */}
      <AttachmentViewer 
        attachments={currentAttachments}
        initialIndex={selectedAttachmentIndex}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">{message.subject}</h2>
          <div className="text-sm text-gray-500">
            <span>From: {message.senderName}</span>
            {message.recipientName && (
              <span className="ml-4">To: {message.recipientName}</span>
            )}
            <span className="ml-4">
              {formatDateSafe(message.timestamp || message.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex space-x-2">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Back
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(message)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reply
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
        <div 
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
      </div>

      {/* Display message attachments if any */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium mb-3">Attachments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {message.attachments.map((attachment, index) => {
              const isImage = attachment.filename.match(/\.(jpeg|jpg|gif|png)$/i);
              const isVideo = attachment.filename.match(/\.(mp4|mov|avi|wmv)$/i);
              
              // Get properly formatted URL for the current environment using the media helper
              // Explicitly set context to 'attachment' to ensure proper URL transformation
              const fixedUrl = getMediaUrl(attachment.url || '', 'attachment');
              
              // Log detailed information for debugging the attachment URL transformation
              console.log(`[MessageDetail] Rendering attachment ${index}:`, {
                original: attachment.url,
                fixed: fixedUrl,
                filename: attachment.filename,
                fileType: isImage ? 'image' : isVideo ? 'video' : 'other',
                context: 'attachment'
              });
                
              return (
                <div
                  key={attachment.id || index}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`Clicked on attachment ${index}:`, attachment);
                    openAttachmentViewer(index);
                  }}
                  className="border rounded hover:bg-gray-50 overflow-hidden cursor-pointer"
                >
                  {isImage ? (
                    <div className="relative">
                      <img 
                        src={fixedUrl} 
                        alt={attachment.filename}
                        className="w-full h-32 object-cover"
                        onLoad={(e) => {
                          console.log(`[MessageDetail] Successfully loaded image: ${fixedUrl}`);
                        }}
                        onError={(e) => {
                          console.error(`[MessageDetail] Image failed to load: ${fixedUrl}`);
                          console.error(`[MessageDetail] Original URL: ${attachment.url}`);
                          console.error(`[MessageDetail] Transformed URL: ${fixedUrl}`);
                          
                          // Enhanced multi-path fallback system
                          const originalUrl = attachment.url || '';
                          const filename = originalUrl.split('/').pop() || '';
                          
                          // Create an array of possible URLs to try in sequence
                          const fallbackUrls = [
                            `/attachments/${filename}`,                        // Direct path without /uploads
                            `/uploads/attachments/${filename}`,                // With /uploads prefix
                            `/api/storage-proxy/MESSAGES/attachments/${filename}`, // Storage proxy URL
                            `/api/attachments/${filename}`                     // API endpoint URL
                          ];
                          
                          console.log(`[MessageDetail] Attachment load failed. Trying fallback URLs for ${filename}:`, fallbackUrls);
                          
                          // Store the fallback index in the element's dataset for tracking
                          if (!e.currentTarget.dataset.fallbackIndex) {
                            e.currentTarget.dataset.fallbackIndex = '0';
                          }
                          
                          const fallbackIndex = parseInt(e.currentTarget.dataset.fallbackIndex, 10);
                          
                          if (fallbackIndex < fallbackUrls.length) {
                            // Try the next fallback URL
                            const nextUrl = fallbackUrls[fallbackIndex];
                            console.log(`[MessageDetail] Trying fallback URL (${fallbackIndex + 1}/${fallbackUrls.length}): ${nextUrl}`);
                            e.currentTarget.dataset.fallbackIndex = (fallbackIndex + 1).toString();
                            e.currentTarget.src = nextUrl;
                          } else {
                            // We've tried all fallbacks without success, use placeholder
                            console.log(`[MessageDetail] All fallbacks failed, using placeholder`);
                            e.currentTarget.src = '/public/media-placeholder/image-placeholder.png';
                            
                            // Create a debug element to show in the UI
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              const debugInfo = document.createElement('div');
                              debugInfo.className = 'absolute top-0 right-0 bg-red-500 text-white text-xs p-1';
                              debugInfo.textContent = 'Failed to load image';
                              parent.appendChild(debugInfo);
                            }
                          }
                        }} 
                      />
                    </div>
                  ) : isVideo ? (
                    <div className="relative bg-black">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-12 h-12 text-white opacity-70" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                      <div className="w-full h-32 bg-gray-900"></div>
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-gray-100 flex items-center justify-center">
                      <div className="text-center">
                        <svg className="w-10 h-10 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{attachment.filename}</p>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Attachment Viewer Modal - Note: Moved outside the conditional rendering */}
          
        </div>
      )}
      
      {/* Display replies section */}
      <div className="mt-8">
        <h3 className="font-medium mb-3 text-lg border-b pb-2">
          Conversation Replies ({replies.length})
        </h3>
        
        {loading ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
            <p className="mt-2 text-gray-600">Loading replies...</p>
          </div>
        ) : replies.length > 0 ? (
          <div className="space-y-4">
            {replies.map((reply) => (
              <MessageReply 
                key={reply.id} 
                reply={reply} 
                formatDate={formatDate}
                onViewAttachment={openReplyAttachmentViewer}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            No replies to this message yet.
          </div>
        )}
      </div>
    </div>
  );
};