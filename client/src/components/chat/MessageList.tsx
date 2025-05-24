import React from 'react';
import { Message } from '../../context/ChatContext';

interface MessageListProps {
  messages: Message[];
  onSelectMessage: (message: Message) => void;
  selectedMessageId?: number;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onSelectMessage,
  selectedMessageId
}) => {
  // Simplified date formatting function using native JS
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

  if (!messages || messages.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No messages found.</p>
      </div>
    );
  }

  // Filter out messages that are replies (they'll be shown with their parent)
  const rootMessages = messages.filter(message => !message.inReplyTo);

  return (
    <div className="divide-y divide-gray-100">
      {rootMessages.map((message) => {
        const hasReplies = message.replies && Array.isArray(message.replies) && message.replies.length > 0;
        
        return (
          <div
            key={message.id}
            onClick={() => onSelectMessage(message)}
            className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
              selectedMessageId === message.id ? 'bg-blue-50' : ''
            } ${!message.read ? 'font-semibold' : ''}`}
          >
            <div className="flex justify-between items-start mb-1">
              <h3 className="text-base font-medium truncate">{message.subject || 'No Subject'}</h3>
              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                {message.timestamp || message.createdAt ? 
                  formatDateSafe(message.timestamp || message.createdAt) : 'Unknown date'}
              </span>
            </div>
            
            <div className="flex justify-between items-start">
              <p className="text-sm text-gray-600 truncate">{message.senderName || 'Unknown Sender'}</p>
              {!message.read && (
                <span className="inline-block w-2 h-2 bg-blue-600 rounded-full ml-2" 
                  title="Unread message"></span>
              )}
            </div>
            
            <div className="flex items-center">
              <p className="text-sm text-gray-500 mt-1 truncate flex-grow">
                {message.content ? message.content.substring(0, 60) + (message.content.length > 60 ? '...' : '') : 'No content'}
              </p>
              
              {/* Show attachment icon if message has attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <span className="ml-2 flex items-center text-gray-500">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-xs">{message.attachments.length}</span>
                </span>
              )}
              
              {/* Show reply count if there are replies */}
              {hasReplies && message.replies && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">
                  {message.replies.length} {message.replies.length === 1 ? 'reply' : 'replies'}
                </span>
              )}
            </div>
            
            {/* Show attachment thumbnails if message has attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex mt-2 space-x-2 overflow-x-auto pb-2">
                {message.attachments.map((attachment, index) => {
                  const isImage = attachment.filename.match(/\.(jpeg|jpg|gif|png)$/i);
                  
                  return (
                    <div key={index} className="flex-shrink-0">
                      {isImage ? (
                        <img 
                          src={attachment.url} 
                          alt={attachment.filename}
                          className="h-16 w-16 object-cover rounded border border-gray-200" 
                        />
                      ) : (
                        <div className="h-16 w-16 flex items-center justify-center bg-gray-100 rounded border border-gray-200">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};