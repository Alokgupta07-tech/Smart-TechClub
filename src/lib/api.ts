/**
 * API Service Layer
 * All functions interact with MySQL backend
 * NO MOCK DATA ALLOWED
 */

import { Team, AdminStats, Alert, LeaderboardEntry, ApiResponse, TeamActionPayload } from '@/types/api';

// API Base URL - uses relative path for Vercel, localhost for dev
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Try to refresh the access token using the refresh token
 */
async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generic fetch wrapper with error handling and automatic token refresh
 */
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const accessToken = localStorage.getItem('accessToken');
    const makeRequest = (token: string | null) =>
      fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options?.headers || {}),
        },
        ...options,
      });

    let response = await makeRequest(accessToken);

    // On 401, try refreshing the token once
    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.code === 'TOKEN_EXPIRED') {
        const newToken = await tryRefreshToken();
        if (newToken) {
          response = await makeRequest(newToken);
        }
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        // Only redirect to login if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
}

/**
 * ADMIN ENDPOINTS
 */

/**
 * Get all teams from database
 * Maps to: SELECT * FROM teams ORDER BY created_at DESC
 */
export async function fetchTeams(): Promise<Team[]> {
  return fetchAPI<Team[]>('/admin/teams');
}

/**
 * Get aggregated statistics
 * Calculated from SQL queries, NOT frontend calculations
 */
export async function fetchStats(): Promise<AdminStats> {
  return fetchAPI<AdminStats>('/admin/stats');
}

/**
 * Get recent alerts from activity_logs
 */
export async function fetchAlerts(): Promise<Alert[]> {
  return fetchAPI<Alert[]>('/admin/alerts');
}

/**
 * Perform action on a team
 */
export async function performTeamAction(payload: TeamActionPayload): Promise<ApiResponse<any>> {
  return fetchAPI<ApiResponse<any>>(`/admin/team/${payload.teamId}/action`, {
    method: 'PATCH',
    body: JSON.stringify({ action: payload.action }),
  });
}

/**
 * LEADERBOARD ENDPOINTS
 */

/**
 * Get leaderboard rankings (public endpoint)
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetchAPI<{ results_published: boolean; teams: LeaderboardEntry[] } | LeaderboardEntry[]>('/leaderboard');
  // Handle both response formats: { teams: [...] } or direct array
  if (Array.isArray(response)) {
    return response;
  }
  return response.teams || [];
}

/**
 * AUTHENTICATION HELPERS
 */

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
  return localStorage.getItem('accessToken');
}

/**
 * Fetch with auth token + automatic refresh on 401.
 * Drop-in replacement for raw fetch() in components.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const errorData = await response.clone().json().catch(() => ({}));
    if (errorData.code === 'TOKEN_EXPIRED') {
      const newToken = await tryRefreshToken();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(url, { ...options, headers });
      }
    }
  }

  return response;
}

/**
 * Check if user is admin
 */
export function isAdmin(): boolean {
  const role = localStorage.getItem('userRole');
  return role === 'admin';
}

/**
 * Format time elapsed for display
 */
export function formatTimeElapsed(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Calculate relative time (e.g., "2 min ago")
 */
export function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) return `${diffSecs} sec ago`;
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHrs < 24) return `${diffHrs} hr ago`;
  return `${diffDays} day ago`;
}
