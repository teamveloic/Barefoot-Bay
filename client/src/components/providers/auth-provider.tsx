import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

// Helper function to update username meta tag
const updateUsernameMetaTag = (username: string | null) => {
  // Remove existing username meta tag if it exists
  const existingMeta = document.querySelector('meta[name="username"]');
  if (existingMeta) {
    existingMeta.remove();
  }
  
  // Add new meta tag if username is provided
  if (username) {
    const meta = document.createElement('meta');
    meta.name = 'username';
    meta.content = username;
    document.head.appendChild(meta);
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    onSuccess: (userData) => {
      // Update username meta tag when user data changes
      updateUsernameMetaTag(userData?.username || null);
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
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

      const res = await apiRequest("PATCH", "/api/user", data);
      const responseText = await res.text();
      console.log("Debug: Raw API response:", responseText);

      try {
        return JSON.parse(responseText);
      } catch (error) {
        console.error("Debug: Error parsing response:", error);
        throw new Error("Invalid server response");
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
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
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
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create the value object to provide to context
  const value = {
    user: user ?? null,
    isLoading,
    error,
    loginMutation,
    logoutMutation,
    registerMutation,
    updateProfileMutation,
  };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}