import { useState, useEffect } from 'react';

interface ActiveUser {
  userId: number | string;
  username: string;
  lastActive: string;
  path: string;
  userAgent: string;
}

interface ActiveUsersData {
  success: boolean;
  activeUserCount: number;
  activeUsers: ActiveUser[];
}

/**
 * Custom hook to fetch and poll for active users
 * To be used in admin components that need real-time user tracking
 */
export function useActiveUsers(pollingInterval = 60000) {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [activeUserCount, setActiveUserCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to fetch active users
  const fetchActiveUsers = async () => {
    try {
      const response = await fetch('/active-users', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch active users: ${response.status}`);
      }

      const data: ActiveUsersData = await response.json();
      
      if (data.success) {
        setActiveUsers(data.activeUsers);
        setActiveUserCount(data.activeUserCount);
      } else {
        throw new Error('Failed to get active users data');
      }
      
      setError(null);
    } catch (err) {
      console.error('Error fetching active users:', err);
      setError(err instanceof Error ? err : new Error('Unknown error fetching active users'));
    } finally {
      setIsLoading(false);
    }
  };

  // Set up polling for active users
  useEffect(() => {
    // Fetch immediately on mount
    fetchActiveUsers();
    
    // Set up interval for polling
    const intervalId = setInterval(fetchActiveUsers, pollingInterval);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [pollingInterval]);

  return { activeUsers, activeUserCount, isLoading, error, refresh: fetchActiveUsers };
}