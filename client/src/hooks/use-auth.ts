// Re-export from auth provider
export { useAuth, AuthProvider } from '../components/providers/auth-provider';

// Add a useAdminOnly hook for admin routes
export function useAdminOnly() {
  const { useAuth } = require('../components/providers/auth-provider');
  const { UserRole } = require('@shared/schema');
  const auth = useAuth();
  const isAdmin = !auth.isLoading && auth.user?.role === UserRole.ADMIN;
  return { isAdmin, isLoading: auth.isLoading, user: auth.user };
}