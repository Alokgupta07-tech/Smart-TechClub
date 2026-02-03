/**
 * API Service Layer
 * All functions interact with MySQL backend
 * NO MOCK DATA ALLOWED
 */

import { Team, AdminStats, Alert, LeaderboardEntry, ApiResponse, TeamActionPayload } from '@/types/api';

// API Base URL - Update this to your backend URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const accessToken = localStorage.getItem('accessToken');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        // Add auth token if needed
        ...(options?.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      // Handle 401 Unauthorized - clear tokens and redirect to login
      if (response.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        window.location.href = '/login';
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
  return fetchAPI<LeaderboardEntry[]>('/leaderboard');
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
