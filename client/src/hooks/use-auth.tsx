import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { analyticsTracker } from "../lib/analytics-tracker";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  updateProfileMutation: UseMutationResult<SelectUser, Error, Partial<SelectUser>>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
    refetch: refetchUser,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async ({ signal }) => {
      try {
        // First try the standard endpoint
        const res = await fetch("/api/user", {
          credentials: "include", // Important for cross-domain cookies
          signal,
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (res.ok) {
          return await res.json();
        }
        
        // If that fails with a 401, try the cross-domain compatibility endpoint
        if (res.status === 401) {
          console.log("Using cross-domain auth compatibility endpoint");
          const backupRes = await fetch("/api/auth/check", {
            credentials: "include",
            signal,
            headers: {
              'Accept': 'application/json',
            }
          });
          
          const data = await backupRes.json();
          
          // If authenticated, return the user
          if (data.isAuthenticated && data.user) {
            return data.user;
          }
          
          // Otherwise return null to indicate not logged in
          return null;
        }
        
        throw new Error(`User fetch failed: ${res.status} ${res.statusText}`);
      } catch (err) {
        console.error("Error fetching user:", err);
        return null; // Return null instead of throwing to prevent constant retries
      }
    },
    // Shorter staleTime for more responsive auth state
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false, // Don't retry on failure
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        // First try the standard login endpoint
        const res = await apiRequest("POST", "/api/login", credentials);
        
        if (res.ok) {
          return await res.json();
        }
        
        // If that fails or has cross-domain issues, try the compatibility endpoint
        console.log("Trying cross-domain login compatibility endpoint");
        const crossDomainRes = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(credentials)
        });
        
        const data = await crossDomainRes.json();
        
        if (!crossDomainRes.ok) {
          throw new Error(data.message || "Login failed");
        }
        
        return data.user;
      } catch (error: any) {
        console.error("Login error:", error);
        throw new Error(error.message || "Login failed. Please try again.");
      }
    },
    onSuccess: (user: SelectUser) => {
      // Update the cached user data
      queryClient.setQueryData(["/api/user"], user);
      
      // Force a refetch to ensure we have the latest auth state
      refetchUser();
      
      // Track login event in analytics
      analyticsTracker.trackAuthentication(true, user.id);
      analyticsTracker.trackEvent('user_login', { 
        userId: user.id, 
        username: user.username, 
        role: user.role 
      });
      
      // Show success toast
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.fullName || user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<SelectUser>) => {
      console.log("Debug: Starting profile update mutation with data:", data);

      try {
        const res = await apiRequest("PATCH", "/api/user", data);
        
        if (!res.ok) {
          throw new Error(`Profile update failed: ${res.status} ${res.statusText}`);
        }
        
        const responseText = await res.text();
        console.log("Debug: Raw API response:", responseText);

        try {
          return JSON.parse(responseText);
        } catch (error) {
          console.error("Debug: Error parsing response:", error);
          throw new Error("Invalid server response");
        }
      } catch (error: any) {
        console.error("Debug: Profile update request error:", error);
        throw new Error(error.message || "Failed to update profile. Please try again.");
      }
    },
    onSuccess: (user: SelectUser) => {
      console.log("Debug: Profile update successful, updating cache with:", user);

      // Update the cached user data
      queryClient.setQueryData(["/api/user"], user);

      // Show success message
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });

      // Force a refetch to ensure we have the latest state
      refetchUser();
    },
    onError: (error: Error) => {
      console.error("Debug: Profile update mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        // First try the standard logout endpoint
        const res = await apiRequest("POST", "/api/logout");
        
        if (res.ok) {
          return;
        }
        
        // If that fails with cross-domain issues, try the compatibility endpoint
        console.log("Trying cross-domain logout compatibility endpoint");
        const crossDomainRes = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
        });
        
        if (!crossDomainRes.ok) {
          const data = await crossDomainRes.json();
          throw new Error(data.message || "Logout failed");
        }
      } catch (error: any) {
        console.error("Logout error:", error);
        throw new Error(error.message || "Logout failed. Please try again.");
      }
    },
    onSuccess: () => {
      // Get user before clearing cache
      const user = queryClient.getQueryData<SelectUser>(["/api/user"]);
      
      // Track logout event in analytics if we have a user
      if (user) {
        analyticsTracker.trackAuthentication(false, user.id);
        analyticsTracker.trackEvent('user_logout', { 
          userId: user.id, 
          username: user.username 
        });
      }
      
      // Clear user data from cache
      queryClient.setQueryData(["/api/user"], null);
      
      // Invalidate all queries that might contain user-specific data
      queryClient.invalidateQueries();
      
      // Show success toast
      toast({
        title: "Logged out",
        description: "You have been successfully logged out."
      });
    },
    onError: (error: Error) => {
      console.error("Logout error:", error);
      
      // Even if the server-side logout failed, clear client-side auth state
      // This ensures the user can still "log out" from their perspective
      queryClient.setQueryData(["/api/user"], null);
      
      toast({
        title: "Logout issue",
        description: "You've been logged out locally, but there was a server communication issue.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      try {
        // Try the standard registration endpoint
        const res = await apiRequest("POST", "/api/register", credentials);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: `Registration failed (${res.status})` }));
          throw new Error(errorData.message || "Registration failed");
        }
        
        return await res.json();
      } catch (error: any) {
        console.error("Registration error:", error);
        throw new Error(error.message || "Registration failed. Please try again.");
      }
    },
    onSuccess: (user: SelectUser) => {
      // Update the cached user data
      queryClient.setQueryData(["/api/user"], user);
      
      // Force a refetch to ensure we have the latest auth state
      refetchUser();
      
      // Track registration event in analytics
      analyticsTracker.trackAuthentication(true, user.id);
      analyticsTracker.trackEvent('user_registration', { 
        userId: user.id, 
        username: user.username,
        role: user.role,
        isResident: user.isResident
      });
      
      // Show success toast
      toast({
        title: "Registration successful",
        description: "Your account has been created successfully. Welcome to Barefoot Bay!",
      });
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message || "Registration failed. Please try different credentials or try again later.",
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        updateProfileMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}