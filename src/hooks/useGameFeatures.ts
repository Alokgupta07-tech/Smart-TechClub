// src/hooks/useGameFeatures.ts
/**
 * React Query Hooks for New Game Features
 * Leaderboard, Achievements, Notifications, Analytics
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';
import {
  Achievement,
  Notification,
  PuzzleAnalytics,
  SuspiciousAlert,
  TimelineActivity,
  Hint,
  PuzzleTimerStatus
} from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ============================================
// LEADERBOARD HOOKS
// ============================================

export interface LeaderboardEntry {
  rank: number;
  id: string;
  teamName: string;
  level: number;
  status: string;
  progress: number;
  puzzlesSolved: number;
  hintsUsed: number;
  totalTimeSeconds: number;
  effectiveTime: number;
}

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/leaderboard`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    refetchInterval: 15000, // Reduced from 5s for better scalability
    staleTime: 10000,
  });
}

export function useTeamRank(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-rank', teamId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/leaderboard/rank/${teamId}`);
      if (!response.ok) throw new Error('Failed to fetch rank');
      return response.json();
    },
    enabled: !!teamId,
    refetchInterval: 10000,
  });
}

// ============================================
// ACHIEVEMENT HOOKS
// ============================================

export function useTeamAchievements(teamId: string | undefined) {
  return useQuery<Achievement[]>({
    queryKey: ['achievements', teamId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/teams/${teamId}/achievements`);
      if (!response.ok) throw new Error('Failed to fetch achievements');
      return response.json();
    },
    enabled: !!teamId,
    staleTime: 30000,
  });
}

export function useAllAchievements() {
  return useQuery<Achievement[]>({
    queryKey: ['all-achievements'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/achievements`);
      if (!response.ok) throw new Error('Failed to fetch achievements');
      return response.json();
    },
    staleTime: 60000,
  });
}

// ============================================
// NOTIFICATION HOOKS
// ============================================

export function useNotifications() {
  return useQuery<{ count: number; notifications: Notification[] }>({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/notifications/unread`);
      if (!response.ok) {
        if (response.status === 401) return { count: 0, notifications: [] };
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    refetchInterval: 15000, // Reduced from 5s for better scalability
    staleTime: 10000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Failed to mark as read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    }
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Failed to mark all as read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      toast.success('All notifications marked as read');
    }
  });
}

// ============================================
// ANALYTICS HOOKS (ADMIN)
// ============================================

export function usePuzzleAnalytics(puzzleId: string | undefined) {
  return useQuery<PuzzleAnalytics>({
    queryKey: ['puzzle-analytics', puzzleId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/puzzle/${puzzleId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    enabled: !!puzzleId,
    refetchInterval: 30000,
  });
}

export function useAllPuzzleAnalytics() {
  return useQuery<PuzzleAnalytics[]>({
    queryKey: ['all-puzzle-analytics'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/analytics/puzzles`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 60000,
  });
}

// ============================================
// SUSPICIOUS ACTIVITY HOOKS (ADMIN)
// ============================================

export function useSuspiciousAlerts(unreviewedOnly = true) {
  return useQuery<SuspiciousAlert[]>({
    queryKey: ['suspicious-alerts', unreviewedOnly],
    queryFn: async () => {
      const response = await fetchWithAuth(
        `${API_BASE}/admin/suspicious?unreviewedOnly=${unreviewedOnly}`
      );
      if (!response.ok) throw new Error('Failed to fetch alerts');
      return response.json();
    },
    refetchInterval: 10000,
  });
}

export function useReviewAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/suspicious/${alertId}/review`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Failed to review alert');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suspicious-alerts'] });
      toast.success('Alert marked as reviewed');
    },
    onError: () => {
      toast.error('Failed to review alert');
    }
  });
}

// ============================================
// TEAM TIMELINE HOOKS (ADMIN)
// ============================================

export function useTeamTimeline(teamId: string | undefined) {
  return useQuery<TimelineActivity[]>({
    queryKey: ['team-timeline', teamId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/team/${teamId}/timeline`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
    enabled: !!teamId,
    refetchInterval: 10000,
  });
}

// ============================================
// PROGRESSIVE HINTS HOOKS
// ============================================

export interface HintsData {
  hints: Hint[];
  nextHintUnlockIn: number | null;
  elapsedSeconds: number;
  lastHintNumber: number;
}

export function usePuzzleHints(puzzleId: string | undefined) {
  return useQuery<HintsData>({
    queryKey: ['hints', puzzleId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/gameplay/puzzle/${puzzleId}/hints`);
      if (!response.ok) throw new Error('Failed to fetch hints');
      return response.json();
    },
    enabled: !!puzzleId,
    refetchInterval: 5000,
  });
}

export function useHint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ puzzleId, hintId }: { puzzleId: string; hintId: string }) => {
      const response = await fetchWithAuth(`${API_BASE}/gameplay/puzzle/${puzzleId}/hint/${hintId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to use hint');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hints', variables.puzzleId] });
      toast.warning(`Hint unlocked! Time penalty: +${Math.floor(data.penaltySeconds / 60)} min`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });
}

// ============================================
// PUZZLE TIMER HOOKS
// ============================================

export function usePuzzleTimer(puzzleId: string | undefined) {
  return useQuery<PuzzleTimerStatus>({
    queryKey: ['puzzle-timer', puzzleId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/gameplay/puzzle/${puzzleId}/timer`);
      if (!response.ok) throw new Error('Failed to fetch timer');
      return response.json();
    },
    enabled: !!puzzleId,
    refetchInterval: 5000, // Check every 5 seconds (client handles countdown display)
  });
}

// ============================================
// BROADCAST (ADMIN)
// ============================================

export function useBroadcastNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, message, priority }: { title: string; message: string; priority?: string }) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/notifications/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, message, priority })
      });
      if (!response.ok) throw new Error('Failed to send broadcast');
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`Broadcast sent to ${data.notifiedTeams} teams`);
    },
    onError: () => {
      toast.error('Failed to send broadcast');
    }
  });
}
