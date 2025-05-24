import React, { useState, useEffect } from 'react';
import { Message } from '../../types/chat';
import { Button } from '../ui/button';
import { PlusIcon, RefreshCw, ArrowLeft } from 'lucide-react';
import { MessageList } from './MessageList';
import { MessageDetail } from './MessageDetail';
import { MessageComposer } from './MessageComposer';

const MobileChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Array<{id: string, name: string}>>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch messages on component mount
  useEffect(() => {
    fetchMessages();
    fetchRecipients();
  }, []);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setRefreshing(true);
      
      const response = await fetch('/api/messages');
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();
      setMessages(data);
      
      // Count unread messages
      const unread = data.filter((msg: Message) => !msg.read).length;
      setUnreadCount(unread);
      
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      setError('Error fetching messages. Please try again later.');
      setLoading(false);
      setRefreshing(false);
      console.error('Error fetching messages:', err);
    }
  };

  const fetchRecipients = async () => {
    try {
      const response = await fetch('/api/chat/recipients');
      if (!response.ok) {
        throw new Error('Failed to fetch recipients');
      }
      const data = await response.json();
      setRecipients(data);
    } catch (err) {
      console.error('Error fetching recipients:', err);
    }
  };

  const handleSelectMessage = async (message: Message) => {
    try {
      // Mark as read if it's unread
      if (!message.read) {
        const response = await fetch(`/api/messages/${message.id}/read`, {
          method: 'PUT',
        });
        
        if (response.ok) {
          // Update the message in the list
          setMessages(messages.map(msg => 
            msg.id === message.id ? { ...msg, read: true } : msg
          ));
          
          // Update unread count
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
      
      setSelectedMessage(message);
      setView('detail');
    } catch (err) {
      console.error('Error marking message as read:', err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remove from messages list
        setMessages(messages.filter(msg => msg.id !== messageId));
        
        // If this was the selected message, clear selection and go back to list
        if (selectedMessage && selectedMessage.id === messageId) {
          setSelectedMessage(null);
          setView('list');
        }
      }
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  const handleBackToList = () => {
    setView('list');
  };

  const handleNewMessage = () => {
    setShowComposer(true);
  };

  const handleSubmitMessage = async (formData: FormData) => {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        // Refresh messages list
        fetchMessages();
        setShowComposer(false);
      } else {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Detail view
  if (view === 'detail' && selectedMessage) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 bg-white p-4 border-b z-10">
          <Button 
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className="flex items-center justify-center"
          >
            <ArrowLeft size={18} className="mr-2" />
            Back to messages
          </Button>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <MessageDetail
            message={selectedMessage}
            onBack={handleBackToList}
            onDelete={() => handleDeleteMessage(selectedMessage.id)}
          />
        </div>
        
        {showComposer && (
          <MessageComposer
            isOpen={showComposer}
            onClose={() => setShowComposer(false)}
            onSend={handleSubmitMessage}
            recipients={recipients}
          />
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-white p-4 border-b z-10">
        <h1 className="text-xl font-bold">Messages</h1>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMessages}
            disabled={refreshing}
            className="h-9 w-9 p-0"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button 
            onClick={handleNewMessage}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <PlusIcon size={16} className="mr-1" />
            New
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto px-4">
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading messages...</div>
        ) : error ? (
          <div className="p-4 text-center text-red-500">{error}</div>
        ) : messages.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No messages yet</div>
        ) : (
          <MessageList
            messages={messages}
            onSelectMessage={handleSelectMessage}
            selectedId={selectedMessage?.id}
          />
        )}
      </div>
      
      {showComposer && (
        <MessageComposer
          isOpen={showComposer}
          onClose={() => setShowComposer(false)}
          onSend={handleSubmitMessage}
          recipients={recipients}
        />
      )}
    </div>
  );
};

export default MobileChat;