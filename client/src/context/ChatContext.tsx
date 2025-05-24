import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/components/providers/auth-provider';

// Message type
export type Message = {
  id: number;
  senderId: number;
  recipientId: number;
  subject: string;
  content: string;
  read: boolean;
  timestamp: string;
  createdAt?: string | Date; // Added createdAt field which might exist in some responses
  senderName?: string;
  recipientName?: string;
  inReplyTo?: number;  // Foreign key to parent message
  in_reply_to?: number; // Database column name (snake_case version)
  attachments?: Array<{
    id: string;
    url: string;
    filename: string;
    contentType?: string;
  }>;
  replies: Message[]; // Making this non-optional and ensuring it's initialized
};

// Enhanced context type
type ChatContextType = {
  messages: Message[];
  selectedMessage: Message | null;
  unreadCount: number;
  loading: boolean;
  error: string | null;
  sendMessage: (message: any) => Promise<any>;
  replyToMessage: (originalMessageId: number, content: string, attachments?: any[]) => Promise<any>;
  deleteMessage: (messageId: number) => Promise<void>;
  markAsRead: (messageId: number) => Promise<void>;
  selectMessage: (message: Message | null) => void;
  fetchMessages: () => Promise<void>;
  clearError: () => void;
  recipients: Array<{id: number | string, name: string}>;
};

// Create context
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Enhanced provider component
export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Array<{id: number | string, name: string}>>([]);
  const { user } = useAuth();

  // Fetch messages when component mounts
  useEffect(() => {
    if (user) {
      fetchMessages();
      fetchRecipients();
    }
  }, [user]);

  // Fetch recipients
  const fetchRecipients = async () => {
    try {
      const response = await fetch('/api/chat/recipients');
      
      if (!response.ok) {
        console.warn('Could not fetch recipients, using admin as fallback');
        setRecipients([{ id: 'admin', name: 'Administrator' }]);
        return;
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setRecipients(data);
      } else {
        // Fallback
        setRecipients([{ id: 'admin', name: 'Administrator' }]);
      }
    } catch (error) {
      console.error('Error fetching recipients:', error);
      // Fallback
      setRecipients([{ id: 'admin', name: 'Administrator' }]);
    }
  };

  // Fetch all messages
  const fetchMessages = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('📩 Fetching messages...');
      const response = await fetch('/api/messages');
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      const data = await response.json();
      let rawMessages = [];
      
      // Ensure we have a messages array
      if (Array.isArray(data)) {
        rawMessages = data;
        console.log(`📩 Received ${rawMessages.length} messages from API`);
      } else if (data.messages && Array.isArray(data.messages)) {
        rawMessages = data.messages;
        console.log(`📩 Received ${rawMessages.length} messages from API (in messages property)`);
      } else {
        console.warn('Invalid messages format received:', data);
        setMessages([]);
        setUnreadCount(0);
        return;
      }
      
      // Process messages into threads
      const messageMap = new Map(); // Store all messages by ID
      const rootMessages = []; // Store only root messages (not replies)
      
      console.log('Processing messages for threading, total count:', rawMessages.length);
      
      // First pass: Map all messages by ID
      rawMessages.forEach(message => {
        messageMap.set(message.id, {
          ...message,
          replies: []
        });
      });
      
      // Build a map of original messages and their replies
      const messageThreads = new Map();
      const replyMessages = new Set();
      
      // First scan to identify all reply messages and their parent messages
      rawMessages.forEach(message => {
        if (message.in_reply_to) {
          // This is a reply
          console.log(`Found reply: message ID ${message.id} is a reply to ${message.in_reply_to}`);
          replyMessages.add(message.id);
          
          // Get or create the parent thread
          const parentId = message.in_reply_to;
          if (!messageThreads.has(parentId)) {
            messageThreads.set(parentId, []);
          }
          
          // Add this reply to its parent's thread
          const replyMsg = messageMap.get(message.id);
          if (replyMsg) {
            messageThreads.get(parentId).push(replyMsg);
            console.log(`Added reply ${message.id} to parent ${parentId}'s thread`);
          } else {
            console.error(`Reply message ${message.id} not found in message map!`);
          }
        }
      });
      
      // Now organize root messages and their replies
      rawMessages.forEach(message => {
        // If this message is not a reply itself, it's a root message
        if (!replyMessages.has(message.id)) {
          // Get the message object from our map
          const messageObj = messageMap.get(message.id);
          
          // Attach any replies to this root message
          if (messageThreads.has(message.id)) {
            messageObj.replies = messageThreads.get(message.id);
            console.log(`Root message ${message.id} has ${messageObj.replies.length} replies`);
            
            // Gmail-style threading: If any reply is unread, mark parent as unread
            const hasUnreadReplies = messageObj.replies.some(reply => reply.read === false);
            if (hasUnreadReplies) {
              messageObj.read = false; // Mark parent as unread if it has unread replies
              console.log(`Root message ${message.id} marked as unread due to unread replies`);
            }
          } else {
            messageObj.replies = [];
          }
          
          // Add to root messages list
          rootMessages.push(messageObj);
        }
      });
      
      // Our filtered root messages are now correct - no duplicates
      const rootMessagesFiltered = rootMessages;
      
      // Sort root messages by timestamp (newest first) with robust date handling
      const sortedRootMessages = [...rootMessagesFiltered].sort((a, b) => {
        const dateA = new Date(a.timestamp || a.createdAt || '');
        const dateB = new Date(b.timestamp || b.createdAt || '');
        
        // Check if dates are valid before comparing
        const isValidA = !isNaN(dateA.getTime());
        const isValidB = !isNaN(dateB.getTime());
        
        if (!isValidA && !isValidB) return 0; // Both invalid, keep original order
        if (!isValidA) return 1; // A is invalid, B comes first
        if (!isValidB) return -1; // B is invalid, A comes first
        
        return dateB.getTime() - dateA.getTime(); // Normal comparison
      });
      
      // For each thread, sort replies by timestamp (newest first for reverse chronological order)
      sortedRootMessages.forEach(message => {
        if (message.replies && message.replies.length > 0) {
          message.replies.sort((a, b) => {
            const dateA = new Date(a.timestamp || a.createdAt || '');
            const dateB = new Date(b.timestamp || b.createdAt || '');
            
            // Check if dates are valid before comparing
            const isValidA = !isNaN(dateA.getTime());
            const isValidB = !isNaN(dateB.getTime());
            
            if (!isValidA && !isValidB) return 0; // Both invalid, keep original order
            if (!isValidA) return 1; // A is invalid, B comes first
            if (!isValidB) return -1; // B is invalid, A comes first
            
            return dateB.getTime() - dateA.getTime(); // Newest first (reverse chronological order)
          });
        }
      });
      
      setMessages(sortedRootMessages);
      const unread = rawMessages.filter(msg => msg && msg.read === false).length;
      setUnreadCount(unread);
      
      // Debug logging to verify threading is working
      console.log('Processed message threads:', sortedRootMessages.length, 'root messages');
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  };

  // Send a message
  const sendMessage = async (message: any) => {
    if (!user) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('recipient', message.recipient);
      formData.append('subject', message.subject);
      formData.append('content', message.content);
      
      if (message.attachments && message.attachments.length > 0) {
        for (const file of message.attachments) {
          formData.append('attachments', file);
        }
      }
      
      const response = await fetch('/api/messages', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      const data = await response.json();
      console.log('Message sent successfully, API response:', data);
      
      // Add the new message to our state and select it
      if (data.message) {
        // Create a complete message object with all necessary properties
        const newMessage = {
          ...data.message,
          replies: [],  // Initialize with empty replies array
          read: true    // Mark as read since we're opening it
        };
        
        // Update messages list with new message at the top
        setMessages(prev => [newMessage, ...prev]);
        
        // Important: Set this as the selected message directly
        setSelectedMessage(newMessage);
        console.log('Auto-selected newly sent message:', newMessage);
        
        // Add auto-refresh after sending a message (with small delay to let backend process)
        setTimeout(() => {
          console.log('Auto-refreshing messages after send...');
          fetchMessages();
        }, 1000);
      }
      
      return data.message;
    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Delete a message
  const deleteMessage = async (messageId: number) => {
    setLoading(true);
    
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete message');
      }
      
      // Update local state
      const deletedMessage = messages.find(msg => msg.id === messageId);
      
      // Remove from messages array
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
      // Update unread count if needed
      if (deletedMessage && !deletedMessage.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      // Clear selection if this message was selected
      if (selectedMessage && selectedMessage.id === messageId) {
        setSelectedMessage(null);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete message');
    } finally {
      setLoading(false);
    }
  };

  // Mark message as read
  const markAsRead = async (messageId: number) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/read`, {
        method: 'POST', 
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark message as read');
      }
      
      // Update local state
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId ? { ...msg, read: true } : msg
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Update selected message if needed
      if (selectedMessage && selectedMessage.id === messageId) {
        setSelectedMessage({ ...selectedMessage, read: true });
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
      // Don't show this error to user since it's not critical
    }
  };

  // Select a message
  const selectMessage = async (message: Message | null) => {
    if (message) {
      console.log('Selecting message:', message.id);
      // Fetch full message details including replies
      try {
        // First mark as read immediately to ensure UI updates
        if (!message.read) {
          await markAsRead(message.id);
        }
        
        // Then fetch the complete message with replies
        const response = await fetch(`/api/messages/${message.id}`);
        
        if (!response.ok) {
          console.error(`Error response when fetching message: ${response.status}`);
          throw new Error(`Error fetching message details: ${response.status}`);
        }
        
        const messageData = await response.json();
        console.log('Complete message details from server:', messageData);
        
        // Always fetch replies using the dedicated endpoint
        try {
          console.log('Fetching replies using dedicated endpoint for message ID:', message.id);
          const repliesResponse = await fetch(`/api/messages/${message.id}/replies`);
          
          if (repliesResponse.ok) {
            const repliesData = await repliesResponse.json();
            console.log('Fetched replies from dedicated endpoint:', repliesData);
            
            // Always use the replies from the dedicated endpoint
            messageData.replies = repliesData;
            console.log('Set replies in message data:', messageData);
          } else {
            console.warn(`Failed to fetch replies: ${repliesResponse.status}`);
          }
        } catch (repliesError) {
          console.error('Error fetching replies:', repliesError);
        }
        
        // Set the selected message with complete data including replies
        setSelectedMessage(messageData);
      } catch (error) {
        console.error('Error fetching message details:', error);
        setSelectedMessage(message);
      }
    } else {
      setSelectedMessage(null);
    }
  };
  
  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Reply to a message
  const replyToMessage = async (originalMessageId: number, content: string, attachments: any[] = []) => {
    if (!user) return null;
    
    // Find the original message
    const originalMessage = messages.find(msg => msg.id === originalMessageId);
    if (!originalMessage) {
      setError('Cannot reply: original message not found');
      return null;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Create reply subject with "Re:" prefix if not already present
      const subject = originalMessage.subject.startsWith('Re:') 
        ? originalMessage.subject 
        : `Re: ${originalMessage.subject}`;
      
      // Create a form data object for the reply
      const formData = new FormData();
      formData.append('recipient', String(originalMessage.senderId));
      formData.append('subject', subject);
      formData.append('content', content);
      formData.append('inReplyTo', String(originalMessageId));
      
      // Add attachments if any
      if (attachments.length > 0) {
        for (const file of attachments) {
          formData.append('attachments', file);
        }
      }
      
      // Send the reply to the correct endpoint (/:id/reply)
      const response = await fetch(`/api/messages/${originalMessageId}/reply`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to send reply');
      }
      
      const data = await response.json();
      
      // Handle the reply message from the server
      if (data.message) {
        console.log('Reply successfully sent:', data.message);
        
        // Add inReplyTo property explicitly to ensure the reply is linked to its parent
        const replyMessage = {
          ...data.message,
          inReplyTo: originalMessageId
        };
        
        // First add the reply to the parent message in our local state
        setMessages(prev => {
          return prev.map(msg => {
            if (msg.id === originalMessageId) {
              console.log(`Adding reply to message ${msg.id}`);
              return {
                ...msg,
                replies: [...(msg.replies || []), replyMessage]
              };
            }
            return msg;
          });
        });
        
        // Force a complete refresh from the server to update all messages
        setTimeout(() => {
          console.log('Refreshing messages to get updated threads...');
          fetchMessages();
        }, 300);
        
        // Do another refresh after a delay as a fallback
        setTimeout(() => {
          fetchMessages();
        }, 1500);
      }
      
      return data.message;
    } catch (error) {
      console.error('Error sending reply:', error);
      setError(error instanceof Error ? error.message : 'Failed to send reply');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Provide context value
  const contextValue: ChatContextType = {
    messages,
    selectedMessage,
    unreadCount,
    loading,
    error,
    sendMessage,
    replyToMessage,
    deleteMessage,
    markAsRead,
    selectMessage,
    fetchMessages,
    clearError,
    recipients
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

// Custom hook to use the chat context
export const useChat = () => {
  const context = useContext(ChatContext);
  
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  
  return context;
};