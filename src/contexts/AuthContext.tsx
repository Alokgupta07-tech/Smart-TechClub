import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authAPI from '@/lib/authApi';

/**
 * Authentication Context
 * Manages authentication state throughout the app
 */

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'team';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: 'admin' | 'team' | null;
  login: (email: string, password: string) => Promise<authAPI.LoginResponse>;
  verify2FA: (userId: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (payload: authAPI.RegisterPayload) => Promise<authAPI.RegisterResponse>;
  verifyEmail: (userId: string, otp: string) => Promise<void>;  resendOTP: (userId: string, purpose?: string) => Promise<void>;}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<'admin' | 'team' | null>(null);
  const navigate = useNavigate();

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const accessToken = localStorage.getItem('accessToken');
      const userRole = localStorage.getItem('userRole') as 'admin' | 'team' | null;

      if (!accessToken || !userRole) {
        setIsLoading(false);
        return;
      }

      // Trust the stored token initially - set user state immediately
      // This prevents flashing/redirects while validating
      setRole(userRole);
      setUser({
        id: localStorage.getItem('userId') || '',
        name: userRole === 'admin' ? 'Admin' : 'Team',
        email: localStorage.getItem('userEmail') || '',
        role: userRole,
      });

      try {
        // Validate token with backend (non-blocking for UX)
        if (userRole === 'team') {
          const profile = await authAPI.getMyProfile();
          setUser({
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
          });
        }
        // For admin, we trust the stored token - validation happens on API calls
      } catch (error) {
        console.error('Auth validation failed:', error);
        // Only clear on explicit auth failures, not network errors
        const isAuthError = error instanceof Error && 
          (error.message.includes('401') || error.message.includes('Invalid token'));
        
        if (isAuthError) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('userRole');
          localStorage.removeItem('userEmail');
          setUser(null);
          setRole(null);
          navigate('/login');
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  /**
   * Login
   */
  const login = async (email: string, password: string): Promise<authAPI.LoginResponse> => {
    const response = await authAPI.login({ email, password });

    // If 2FA required, return response without setting state
    if (response.requireTwoFa) {
      return response;
    }

    // Login successful
    if (response.user) {
      setUser({
        ...response.user,
        role: response.user.role as 'admin' | 'team'
      });
      setRole(response.role as 'admin' | 'team');
      localStorage.setItem('userEmail', response.user.email);
    }

    return response;
  };

  /**
   * Verify 2FA
   */
  const verify2FA = async (userId: string, otp: string) => {
    const response = await authAPI.verify2FA({ userId, otp });

    if (response.user) {
      setUser({
        ...response.user,
        role: response.user.role as 'admin' | 'team'
      });
      setRole(response.role as 'admin' | 'team');
      localStorage.setItem('userEmail', response.user.email);
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    const currentRole = role;
    await authAPI.logout();
    localStorage.removeItem('userEmail');
    setUser(null);
    setRole(null);
    // Redirect to appropriate login page based on previous role
    navigate(currentRole === 'admin' ? '/admin-login' : '/login');
  };

  /**
   * Register
   */
  const register = async (payload: authAPI.RegisterPayload): Promise<authAPI.RegisterResponse> => {
    return authAPI.register(payload);
  };

  /**
   * Verify Email
   */
  const verifyEmail = async (userId: string, otp: string) => {
    await authAPI.verifyEmail({ userId, otp });
  };

  /**
   * Resend OTP
   */
  const resendOTP = async (userId: string, purpose: string = 'verify') => {
    await authAPI.resendOTP(userId, purpose);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    role,
    login,
    verify2FA,
    logout,
    register,
    verifyEmail,
    resendOTP,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

