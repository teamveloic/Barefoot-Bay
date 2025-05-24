import { useState, useEffect } from 'react';
import { apiRequest } from './queryClient';

export interface User {
  id: number;
  username: string;
  role: string;
  isApproved: boolean;
}

interface AuthResponse {
  isAuthenticated: boolean;
  user: User | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Get the current hostname - used for debug logging
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isProduction = hostname.includes('repl.co') || hostname.includes('replit.app');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        console.log('Checking authentication status...', {
          isProduction, 
          hostname,
          hasCookies: document.cookie.includes('connect.sid')
        });
        
        // Use apiRequest to ensure consistent cookie handling
        const response = await apiRequest({
          url: '/api/auth/check',
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        // Read the response body as text first
        const responseText = await response.text();
        
        // Try to parse the response as JSON
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(responseText);
          console.log('Auth check response:', jsonResponse);
        } catch (e) {
          console.error('Failed to parse JSON response:', responseText);
          throw new Error('Invalid server response');
        }
        
        const authResponse: AuthResponse = {
          isAuthenticated: jsonResponse.isAuthenticated,
          user: jsonResponse.user
        };
        
        setUser(authResponse.user);
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching user:", err);
        setError(err instanceof Error ? err : new Error('Failed to fetch user'));
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [hostname, isProduction]);

  const login = async (username: string, password: string) => {
    try {
      console.log('Attempting login...', { isProduction, hostname });
      
      // Use apiRequest to ensure consistent cookie handling
      const response = await apiRequest({
        url: '/api/auth/login',
        method: 'POST',
        body: { username, password },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const jsonResponse = await response.json();
      
      // The server should always return the user object when login is successful
      setUser(jsonResponse.user);
      
      console.log('Login successful', {
        isAuthenticated: jsonResponse.isAuthenticated,
        hasCookies: document.cookie.includes('connect.sid'),
        user: jsonResponse.user
      });
      
      return { success: true };
    } catch (err) {
      console.error("Login error:", err);
      const message = err instanceof Error ? err.message : 'Login failed';
      return { success: false, message };
    }
  };

  const logout = async () => {
    try {
      console.log('Attempting logout...', { isProduction, hostname });
      
      // Use apiRequest to ensure consistent cookie handling
      const response = await apiRequest({
        url: '/api/auth/logout',
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setUser(null);
        console.log('Logout successful');
        return { success: true };
      } else {
        throw new Error(result.message || 'Logout failed');
      }
    } catch (err) {
      console.error("Logout error:", err);
      return { success: false, message: err instanceof Error ? err.message : 'Logout failed' };
    }
  };

  return {
    user,
    isLoading,
    error,
    login,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin'
  };
}