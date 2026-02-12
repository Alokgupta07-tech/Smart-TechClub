import axios, { AxiosInstance } from 'axios';

/**
 * Auth API Client
 * Handles all authentication requests with automatic token refresh
 */

// Determine API URL based on environment
const getApiBaseUrl = () => {
  // If explicit URL is provided, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In production (Vercel), use relative path to serverless functions
  if (import.meta.env.PROD) {
    return '/api';
  }
  
  // In development, use local backend server
  return 'http://localhost:5000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance
const authAPI: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Attach access token (skip for public auth endpoints)
authAPI.interceptors.request.use(
  (config) => {
    const url = config.url || '';
    const isPublicAuth = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/verify-email') || url.includes('/auth/resend-otp') || url.includes('/auth/forgot-password') || url.includes('/auth/reset-password') || url.includes('/auth/verify-2fa');
    if (!isPublicAuth) {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh on 401
authAPI.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Log connection errors for debugging
    if (!error.response) {
      console.error('Network error - cannot reach backend:', error.message);
      console.error('Backend URL:', API_BASE_URL);
      console.error('Request URL:', error.config?.url);
    }

    // If 401 and token expired, try to refresh
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        // Call refresh endpoint
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        // Save new access token
        localStorage.setItem('accessToken', data.accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return authAPI(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userRole');
        // Only redirect to login if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ============================================
// AUTH API FUNCTIONS
// ============================================

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  teamName: string;
  members?: Array<{
    name: string;
    email: string;
    phone: string;
    role: string;
  }>;
}

export interface RegisterResponse {
  message: string;
  userId: string;
  email: string;
}

export interface VerifyEmailPayload {
  userId: string;
  otp: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  accessToken?: string;
  refreshToken?: string;
  role?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  requireTwoFa?: boolean;
  userId?: string;
}

export interface Verify2FAPayload {
  userId: string;
  otp: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  userId: string;
  otp: string;
  newPassword: string;
}

/**
 * Register a new team user
 */
export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const { data } = await authAPI.post('/auth/register', payload);
  return data;
}

/**
 * Verify email with OTP
 */
export async function verifyEmail(payload: VerifyEmailPayload): Promise<{ message: string }> {
  const { data } = await authAPI.post('/auth/verify-email', payload);
  return data;
}

/**
 * Resend OTP
 */
export async function resendOTP(userId: string, purpose: string = 'verify'): Promise<{ message: string }> {
  const { data } = await authAPI.post('/auth/resend-otp', { userId, purpose });
  return data;
}

/**
 * Login (admin or team)
 */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await authAPI.post('/auth/login', payload);
  
  // Store tokens if login successful (no 2FA required)
  if (data.accessToken && data.refreshToken) {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userRole', data.role);
  }
  
  return data;
}

/**
 * Verify 2FA code
 */
export async function verify2FA(payload: Verify2FAPayload): Promise<LoginResponse> {
  const { data } = await authAPI.post('/auth/verify-2fa', payload);
  
  // Store tokens after 2FA verification
  if (data.accessToken && data.refreshToken) {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userRole', data.role);
  }
  
  return data;
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem('refreshToken');
  
  try {
    await authAPI.post('/auth/logout', { refreshToken });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
  }
}

/**
 * Forgot password - request reset
 */
export async function forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string; userId: string }> {
  const { data } = await authAPI.post('/auth/forgot-password', payload);
  return data;
}

/**
 * Reset password with OTP
 */
export async function resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
  const { data } = await authAPI.post('/auth/reset-password', payload);
  return data;
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
    refreshToken,
  });

  localStorage.setItem('accessToken', data.accessToken);
  return data.accessToken;
}

// ============================================
// TEAM API FUNCTIONS
// ============================================

export async function getMyTeam() {
  const { data } = await authAPI.get('/team/me');
  return data;
}

export async function getMyProfile() {
  const { data } = await authAPI.get('/team/profile');
  return data.user;
}

export async function updateTeamName(teamName: string) {
  const { data } = await authAPI.put('/team/name', { teamName });
  return data;
}

export async function toggle2FA(enabled: boolean) {
  const { data } = await authAPI.post('/team/2fa', { enabled });
  return data;
}

// ============================================
// ADMIN API FUNCTIONS
// ============================================

export async function getAuditLogs(page = 1, limit = 50) {
  const { data } = await authAPI.get('/admin/audit-logs', {
    params: { page, limit },
  });
  return data;
}

export async function getAllTeams() {
  const { data } = await authAPI.get('/admin/teams');
  return data.teams;
}

export async function getTeamById(id: string) {
  const { data } = await authAPI.get(`/admin/teams/${id}`);
  return data.team;
}

export async function updateTeamStatus(id: string, status: string) {
  const { data } = await authAPI.put(`/admin/teams/${id}/status`, { status });
  return data;
}

export async function getAdminStats() {
  const { data } = await authAPI.get('/admin/stats');
  return data;
}

export default authAPI;
